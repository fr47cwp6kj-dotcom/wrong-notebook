import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, notFound, validationError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { PRACTICE_RESULTS, scheduleMasteryEvaluation } from "@/lib/mastery";
import { MAX_FIGURE_SVG_LENGTH, sanitizeFigureSvg } from "@/lib/figure-svg";
import { gapDigest } from "@/lib/knowledge-gap-store";
import { questionContextKey, recordLearningEvent } from "@/lib/learning-events";

const logger = createLogger('api:practice:record');

const recordSchema = z.object({
    errorItemId: z.string().min(1).optional(),
    result: z.enum(PRACTICE_RESULTS as [string, ...string[]]).optional(),
    isCorrect: z.boolean().nullable().optional(),
    subject: z.string().max(50).nullable().optional(),
    difficulty: z.string().max(20).nullable().optional(),
    questionText: z.string().max(20000).nullable().optional(),
    answerText: z.string().max(20000).nullable().optional(),
    analysis: z.string().max(50000).nullable().optional(),
    figureSvg: z.string().max(MAX_FIGURE_SVG_LENGTH).nullable().optional(),
    // manual：在错题详情中直接录入结果，不附带新题
    source: z.enum(['practice', 'review', 'manual']).optional(),
    // 作答前是否查看了提示或解答；用提示后答对不算独立通过，不影响掌握确认
    hintUsed: z.boolean().optional(),
    hintLevel: z.number().int().min(0).max(3).optional(),
    studentAnswer: z.string().max(4000).optional(),
    revealedAnswer: z.boolean().optional(),
    originalImageUrl: z.string().max(20 * 1024 * 1024).optional(),
    mode: z.enum(['normal', 'warning', 'exam']).optional(),
    takenAt: z.string().datetime({ offset: true }).optional(),
});

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    try {
        const parsed = recordSchema.safeParse(await req.json());
        if (!parsed.success) {
            return validationError("Invalid practice record", parsed.error.issues);
        }
        const { errorItemId, difficulty, questionText, answerText, analysis } = parsed.data;
        let subject = parsed.data.subject;
        const source = parsed.data.source ?? 'practice';
        const figureSvg = sanitizeFigureSvg(parsed.data.figureSvg);
        // 兼容旧客户端只传 isCorrect 的情况
        const result = parsed.data.result
            ?? (parsed.data.isCorrect === true ? 'correct' : parsed.data.isCorrect === false ? 'wrong' : undefined);

        const userId = session.user.id;

        // 关联原题时校验归属，防止写入他人的错题
        let unitIds: string[] = [];
        let originalQuestion = '';
        if (errorItemId) {
            const item = await prisma.errorItem.findUnique({
                where: { id: errorItemId },
                include: { subject: true, gapDiagnoses: { where: { status: 'confirmed' }, select: { unitId: true, sourceDigest: true } } },
            });
            if (!item || item.userId !== userId) {
                return notFound("Item not found");
            }
            subject ??= item.subject?.name ?? null;
            originalQuestion = item.questionText || '';
            unitIds = [...new Set((item.gapDiagnoses ?? []).filter(d => d.sourceDigest === gapDigest(item)).map(d => d.unitId))];
        }

        const isCorrect = result ? result === 'correct' : parsed.data.isCorrect;

        const createRecord = (client: Pick<typeof prisma, 'practiceRecord'>) => client.practiceRecord.create({
            data: {
                userId,
                subject,
                difficulty,
                isCorrect,
                ...(errorItemId ? {
                    errorItemId,
                    result,
                    hintUsed: (parsed.data.hintUsed ?? false) || (parsed.data.hintLevel ?? 0) > 0,
                    hintLevel: parsed.data.hintLevel ?? 0,
                    questionText,
                    answerText,
                    analysis,
                    originalImageUrl: parsed.data.originalImageUrl || null,
                    figureSvg,
                    source,
                } : {}),
                ...(parsed.data.takenAt ? { createdAt: new Date(parsed.data.takenAt) } : {}),
            },
        });
        const record = unitIds.length === 0 ? await createRecord(prisma) : await prisma.$transaction(async tx => {
            const saved = await createRecord(tx);
            for (const unitId of unitIds) {
                if (parsed.data.mode === 'warning') await recordLearningEvent(tx, {
                    userId, unitId, requestId: `warning:${saved.id}:${unitId}`, kind: 'warning', source: 'system',
                    errorItemId, questionKey: questionContextKey(questionText || originalQuestion), createdAt: saved.createdAt,
                    payload: { practiceRecordId: saved.id, result: result ?? null },
                });
                if (saved.hintUsed) await recordLearningEvent(tx, {
                    userId, unitId, requestId: `hint:${saved.id}:${unitId}`, kind: 'hint', source: 'student',
                    errorItemId, questionKey: questionContextKey(questionText || originalQuestion),
                    hintLevel: saved.hintLevel, createdAt: saved.createdAt,
                    payload: { practiceRecordId: saved.id },
                });
                if (parsed.data.revealedAnswer) await recordLearningEvent(tx, {
                    userId, unitId, requestId: `reveal:${saved.id}:${unitId}`, kind: 'reveal', source: 'student',
                    errorItemId, questionKey: questionContextKey(questionText || originalQuestion),
                    createdAt: saved.createdAt, payload: { practiceRecordId: saved.id },
                });
                await recordLearningEvent(tx, {
                    userId, unitId, requestId: `practice:${saved.id}:${unitId}`, kind: source === 'review' ? 'review' : 'answer', source: 'student',
                    errorItemId, questionKey: questionContextKey(questionText || originalQuestion), result,
                    independent: source !== 'manual' && result === 'correct' && !saved.hintUsed,
                    hintLevel: saved.hintLevel, createdAt: saved.createdAt,
                    payload: { practiceRecordId: saved.id, source, studentAnswer: parsed.data.studentAnswer ?? '', mode: parsed.data.mode ?? 'normal' },
                });
            }
            return saved;
        });

        if (errorItemId && result) {
            scheduleMasteryEvaluation([errorItemId]);
        }

        return NextResponse.json(record);
    } catch (error) {
        logger.error({ error }, 'Error saving practice record');
        return internalError("Failed to save record");
    }
}
