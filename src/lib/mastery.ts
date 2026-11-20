import { prisma } from "@/lib/prisma";
import { getAIService } from "@/lib/ai";
import { createLogger } from "@/lib/logger";
import { MASTERY_THRESHOLD, masteryLevelOf, masteryStatusWhere } from "@/lib/mastery-status";
import type { MasteryStatus } from "@/lib/mastery-status";
import type { Prisma } from "@prisma/client";
import type { MasteryHistoryEntry, PracticeResult } from "@/lib/ai/types";

const logger = createLogger('mastery');

export { MASTERY_THRESHOLD };

export const PRACTICE_RESULTS: readonly PracticeResult[] = ['correct', 'wrong', 'not_attempted'];

export function isPracticeResult(value: unknown): value is PracticeResult {
    return typeof value === 'string' && (PRACTICE_RESULTS as readonly string[]).includes(value);
}

// 做对时按难度给分：难度越高越能说明掌握；用提示后答对折算，不算完全独立通过
const CORRECT_SCORE: Record<string, number> = { easy: 0.85, medium: 0.95, hard: 1, harder: 1 };
const HINTED_CORRECT_SCORE = 0.6;
const RESULT_SCORE: Record<Exclude<PracticeResult, 'correct'>, number> = { wrong: 0.1, not_attempted: 0 };
// 每往前一次，权重乘以该系数
const RECENCY_DECAY = 0.7;
// 先验：没有足够记录时向 PRIOR 收缩
const PRIOR = 0.3;
const PRIOR_WEIGHT = 0.5;

/**
 * 规则公式估算掌握概率（0~1），记录按时间从早到晚排列；无记录返回 null。
 * 用提示后答对（hintUsed）的得分打折。
 */
export function computeRuleMastery(history: Array<Pick<MasteryHistoryEntry, 'result' | 'difficulty'> & { hintUsed?: boolean | null }>): number | null {
    if (history.length === 0) {
        return null;
    }
    let weightedSum = PRIOR * PRIOR_WEIGHT;
    let weightTotal = PRIOR_WEIGHT;
    history.forEach((entry, index) => {
        const weight = Math.pow(RECENCY_DECAY, history.length - 1 - index);
        let score: number;
        if (entry.result === 'correct') {
            score = CORRECT_SCORE[entry.difficulty || 'medium'] ?? CORRECT_SCORE.medium;
            if (entry.hintUsed) score = HINTED_CORRECT_SCORE;
        } else {
            score = RESULT_SCORE[entry.result];
        }
        weightedSum += weight * score;
        weightTotal += weight;
    });
    return Math.round((weightedSum / weightTotal) * 100) / 100;
}

/** 有举一反三记录时的 masteryLevel：1 复习中，2 已掌握 */
export function masteryLevelFor(probability: number): number {
    return masteryLevelOf(probability >= MASTERY_THRESHOLD ? 'mastered' : 'reviewing');
}

/** 掌握确认还差的条件（界面据此提示下一步） */
export type MasteryMissingCondition = 'cross_context_correct' | 'review_verification';

export interface MasteryConfirmation {
    level: number;
    missing: MasteryMissingCondition[];
}

/** 判断一次答对是否算独立通过：用提示后答对不计数 */
function isIndependentCorrect(entry: Pick<MasteryHistoryEntry, 'result'> & { hintUsed?: boolean | null }): boolean {
    return entry.result === 'correct' && !entry.hintUsed;
}

/**
 * 掌握确认规则：概率达标只是必要条件，还需
 * 1) 至少两次独立答对（用提示后答对不算）且来自至少两个不同情境（不同日期或不同来源）；
 * 2) 存在一次已完成的复习计划，且其后仍有独立答对（后续复习验证）。
 * 满足 1 未满足 2 时保持复习中并提示「等待后续复习验证」。
 */
export function confirmMasteryLevel(
    probability: number,
    history: Array<Pick<MasteryHistoryEntry, 'result' | 'difficulty' | 'source'> & { hintUsed?: boolean | null; createdAt?: Date | string; questionText?: string | null }>,
    completedReviews: Array<Date | string> = [],
): MasteryConfirmation {
    const missing: MasteryMissingCondition[] = [];
    if (probability < MASTERY_THRESHOLD) return { level: masteryLevelOf('reviewing'), missing: ['cross_context_correct', 'review_verification'] };

    const correctEvents = history.filter(isIndependentCorrect);
    // 同一题隔天或换来源再做仍是同一情境；缺失题目快照的旧记录不提供跨题证据。
    const contexts = new Set(correctEvents
        .map((entry) => entry.questionText?.normalize('NFKC').replace(/\s+/g, ' ').trim())
        .filter((question): question is string => Boolean(question))).size;
    if (correctEvents.length < 2 || contexts < 2) missing.push('cross_context_correct');

    // 后续复习验证：已完成的复习之后仍有独立答对
    const lastReview = completedReviews
        .map((value) => new Date(value).getTime())
        .filter((time) => Number.isFinite(time))
        .sort((a, b) => b - a)[0];
    const verifiedAfterReview = lastReview !== undefined
        && correctEvents.some((entry) => entry.createdAt && new Date(entry.createdAt).getTime() > lastReview);
    if (!verifiedAfterReview) missing.push('review_verification');

    return { level: missing.length === 0 ? masteryLevelOf('mastered') : masteryLevelOf('reviewing'), missing };
}

/**
 * 重新评估一道错题的掌握概率：优先调用 AI，失败时使用规则公式兜底
 */
export async function evaluateErrorItemMastery(errorItemId: string): Promise<void> {
    const item = await prisma.errorItem.findUnique({
        where: { id: errorItemId },
        select: {
            id: true,
            questionText: true,
            mistakeStatus: true,
            tags: { select: { name: true } },
            practiceRecords: {
                where: { result: { not: null } },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                select: { result: true, difficulty: true, source: true, createdAt: true, hintUsed: true, questionText: true },
            },
            reviewSchedules: {
                where: { completedAt: { not: null } },
                select: { completedAt: true },
            },
        },
    });
    if (!item) {
        return;
    }

    const history = item.practiceRecords
        .filter((record) => isPracticeResult(record.result))
        .map((record) => ({
            date: record.createdAt.toISOString(),
            difficulty: record.difficulty,
            result: record.result as PracticeResult,
            source: record.source,
            hintUsed: record.hintUsed,
            questionText: record.questionText,
            createdAt: record.createdAt,
        }));

    const ruleProbability = computeRuleMastery(history);
    if (ruleProbability === null) {
        await prisma.errorItem.update({
            where: { id: item.id },
            data: { masteryProbability: null, masteryReason: null, masterySource: null, masteryEvaluatedAt: null, masteryLevel: masteryLevelOf('new') },
        });
        return;
    }

    let probability = ruleProbability;
    let reason = '';
    let source: 'ai' | 'rule' = 'rule';
    try {
        const result = await getAIService().evaluateMastery({
            questionText: item.questionText || '',
            knowledgePoints: item.tags.map((tag) => tag.name),
            mistakeStatus: item.mistakeStatus,
            history: history.map(({ date, difficulty, result, source: entrySource }) => ({ date, difficulty, result, source: entrySource })),
            ruleProbability,
        });
        probability = result.probability;
        reason = result.reason;
        source = 'ai';
    } catch (error) {
        logger.warn({ errorItemId, error: error instanceof Error ? error.message : String(error) }, 'AI mastery evaluation failed, using rule estimate');
        const correct = history.filter((entry) => entry.result === 'correct').length;
        reason = `共练习 ${history.length} 次，做对 ${correct} 次（规则估算）`;
    }

    // 概率达标只是必要条件；跨题独立作答与后续复习验证都通过才确认已掌握
    const completedReviews = (item.reviewSchedules ?? [])
        .map((schedule) => schedule.completedAt)
        .filter((value): value is Date => value !== null);
    const confirmation = confirmMasteryLevel(probability, history, completedReviews);
    if (confirmation.missing.length > 0) {
        const pending = confirmation.missing
            .map((condition) => condition === 'cross_context_correct' ? '还需在不同题目情境中独立答对' : '等待后续复习验证')
            .join('；');
        reason = `${reason}（${pending}）`;
    }

    await prisma.errorItem.update({
        where: { id: item.id },
        data: {
            masteryProbability: probability,
            masteryReason: reason,
            masterySource: source,
            masteryEvaluatedAt: new Date(),
            masteryLevel: confirmation.level,
        },
    });
    logger.info({ errorItemId, probability, source, level: confirmation.level, missing: confirmation.missing }, 'Mastery evaluated');
}

/** 按复习状态统计错题数量 */
export async function countByMasteryStatus(where: Prisma.ErrorItemWhereInput = {}): Promise<Record<MasteryStatus, number>> {
    const [newCount, reviewing, mastered] = await Promise.all(
        (['new', 'reviewing', 'mastered'] as const).map((status) =>
            prisma.errorItem.count({ where: { AND: [where, masteryStatusWhere(status)] } })),
    );
    return { new: newCount, reviewing, mastered };
}

// 后台评估队列：串行执行，同一题重复入队时只评估一次
const pendingIds = new Set<string>();
let running = false;

async function drainQueue(): Promise<void> {
    if (running) return;
    running = true;
    try {
        while (pendingIds.size > 0) {
            const [id] = pendingIds;
            pendingIds.delete(id);
            try {
                await evaluateErrorItemMastery(id);
            } catch (error) {
                logger.error({ errorItemId: id, error }, 'Mastery evaluation failed');
            }
        }
    } finally {
        running = false;
    }
}

/** 将错题加入后台评估队列，不阻塞当前请求 */
export function scheduleMasteryEvaluation(errorItemIds: string[]): void {
    errorItemIds.forEach((id) => pendingIds.add(id));
    void drainQueue();
}
