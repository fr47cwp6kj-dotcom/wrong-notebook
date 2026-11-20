import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { normalizeGapText } from '@/lib/knowledge-gaps';

export type LearningEventKind = 'answer' | 'hint' | 'reveal' | 'diagnostic_reply' | 'review' | 'warning';
export type EvidenceSource = 'student' | 'ai' | 'system';

export function questionContextKey(questionText: string): string | null {
    const normalized = normalizeGapText(questionText);
    return normalized ? createHash('sha256').update(normalized).digest('hex') : null;
}

interface RecordLearningEvent {
    userId: string;
    unitId: string;
    requestId: string;
    kind: LearningEventKind;
    source: EvidenceSource;
    errorItemId?: string | null;
    questionKey?: string | null;
    result?: string | null;
    independent?: boolean;
    hintLevel?: number;
    payload?: Record<string, string | number | boolean | null>;
    createdAt?: Date;
}

/** 客户端重复提交时保持幂等；事实、AI 推断和系统行为分别标记来源。 */
export async function recordLearningEvent(tx: Prisma.TransactionClient, event: RecordLearningEvent) {
    const { payload, ...fields } = event;
    return tx.learningEvent.upsert({
        where: { userId_requestId: { userId: event.userId, requestId: event.requestId } },
        update: {},
        create: { ...fields, payload: JSON.stringify(payload ?? {}) },
    });
}

export interface LearningEvidence {
    kind: string;
    result: string | null;
    independent: boolean;
    questionKey: string | null;
    hintLevel: number;
    createdAt: Date;
    payload: string;
}

/** 只有独立正确且题目情境不同的证据可提升状态；错误会开启新验证周期。 */
export function summarizeLearningEvidence(events: LearningEvidence[]) {
    const ordered = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const latestFailure = ordered.findLastIndex(event =>
        (event.kind === 'answer' || event.kind === 'review') && event.result === 'wrong');
    const current = ordered.slice(latestFailure + 1);
    const independent = current.filter(event =>
        (event.kind === 'answer' || event.kind === 'review') && event.result === 'correct'
        && event.independent && event.hintLevel === 0 && event.questionKey);
    const contexts = new Set(independent.map(event => event.questionKey)).size;
    const boundaryVerified = independent.some(event => {
        try { return JSON.parse(event.payload).practiceType === 'boundary_contrast'; }
        catch { return false; }
    });
    const reviewVerified = independent.some(event => event.kind === 'review'
        && independent.some(earlier => event.createdAt.getTime() - earlier.createdAt.getTime() >= 20 * 60 * 60 * 1000
            && earlier.questionKey !== event.questionKey));
    const stage = contexts === 0 ? 'pending' : contexts === 1 ? 'preliminary'
        : !boundaryVerified ? 'cross_context' : reviewVerified ? 'stable' : 'temporary';
    return { stage, contexts, boundaryVerified, reviewVerified, attempts: ordered.length };
}
