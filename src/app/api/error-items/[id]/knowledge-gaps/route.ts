import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { badRequest, internalError, notFound, unauthorized } from '@/lib/api-errors';
import { getAIService } from '@/lib/ai';
import { consumeAiQuota } from '@/lib/ai-quota';
import { GapCandidateSchema, GapResultSchema, GAP_STATUSES } from '@/lib/knowledge-gaps';
import { gapDigest, gapUnitKey, saveGap } from '@/lib/knowledge-gap-store';
import { createLogger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/error-message';
import { normalizeGapText } from '@/lib/knowledge-gaps';
import { questionContextKey, recordLearningEvent } from '@/lib/learning-events';

const logger = createLogger('api:knowledge-gaps');
type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().min(1).max(200);
const BodySchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('generate'), reviewedInput: z.literal(true), language: z.enum(['zh', 'en']).default('zh') }),
    z.object({ action: z.literal('manual'), candidate: GapCandidateSchema }),
    z.object({ action: z.literal('status'), diagnosisId: idSchema, status: z.enum(GAP_STATUSES) }),
    z.object({ action: z.literal('approve_practice'), diagnosisId: idSchema }),
    z.object({ action: z.literal('practice'), diagnosisId: idSchema, practiceIndex: z.number().int().min(0).max(2), requestId: z.string().uuid(), answer: z.string().trim().min(1).max(4000), result: z.enum(['correct', 'partial', 'incorrect']) }),
    z.object({ action: z.literal('followup'), diagnosisId: idSchema, requestId: z.string().uuid(), answer: z.string().trim().min(1).max(4000), mode: z.enum(['text', 'option', 'unknown']).default('text'), language: z.enum(['zh', 'en']).default('zh') }),
    z.object({ action: z.literal('split'), diagnosisId: idSchema }),
]);

function handleFailure(error: unknown) {
    const message = getErrorMessage(error);
    if (error instanceof z.ZodError) return badRequest('GAP_INVALID_DATA');
    if (message.startsWith('GAP_')) return badRequest(message);
    logger.error({ message }, '知识漏洞操作失败');
    return internalError('GAP_REQUEST_FAILED');
}

export async function GET(_req: Request, { params }: Context) {
    try {
        const user = await getCurrentUser();
        if (!user || !user.isActive) return unauthorized();
        const { id } = await params;
        const item = await prisma.errorItem.findFirst({ where: { id, userId: user.id }, include: { subject: true, gapDiagnoses: { include: { unit: { select: { unitKey: true } }, events: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } } } });
        if (!item) return notFound();
        const followupEvents = await prisma.learningEvent.findMany({ where: { userId: user.id, errorItemId: id, kind: 'diagnostic_reply' }, orderBy: { createdAt: 'asc' } });
        return NextResponse.json({ diagnoses: item.gapDiagnoses.map(({ payload, sourceDigest, unit, ...diagnosis }) => ({
            ...diagnosis, stale: sourceDigest !== gapDigest(item), candidate: GapCandidateSchema.parse(JSON.parse(payload)),
            merged: unit.unitKey !== gapUnitKey(GapCandidateSchema.parse(JSON.parse(payload))),
            followups: followupEvents.flatMap(event => {
                try {
                    const value: unknown = JSON.parse(event.payload);
                    if (typeof value !== 'object' || value === null) return [];
                    const entry = value as Record<string, unknown>;
                    if (entry.diagnosisId !== diagnosis.id) return [];
                    return [{ source: event.source,
                        question: typeof entry.question === 'string' ? entry.question : undefined,
                        answer: typeof entry.answer === 'string' ? entry.answer : undefined,
                        hypothesis: typeof entry.hypothesis === 'string' ? entry.hypothesis : undefined,
                        nextQuestion: typeof entry.nextQuestion === 'string' ? entry.nextQuestion : undefined }];
                } catch { return []; }
            }),
        })) });
    } catch (error) { return handleFailure(error); }
}

export async function POST(req: Request, { params }: Context) {
    try {
        const user = await getCurrentUser();
        if (!user || !user.isActive) return unauthorized();
        const { id } = await params;
        const item = await prisma.errorItem.findFirst({ where: { id, userId: user.id }, include: { subject: true } });
        if (!item) return notFound();
        const body = BodySchema.parse(await req.json());
        const scope = { stage: item.subject?.stage || user.educationStage || 'unknown', subject: item.subject?.subjectKey || item.subject?.name || 'unknown' };
        if (body.action === 'followup') {
            const diagnosis = await prisma.gapDiagnosis.findFirst({ where: { id: body.diagnosisId, errorItemId: id, unit: { userId: user.id } } });
            if (!diagnosis || diagnosis.sourceDigest !== gapDigest(item)) throw new Error('GAP_STALE');
            const candidate = GapCandidateSchema.parse(JSON.parse(diagnosis.payload));
            const prior = await prisma.learningEvent.findMany({ where: { userId: user.id, unitId: diagnosis.unitId, kind: 'diagnostic_reply' }, orderBy: { createdAt: 'asc' } });
            const turns = prior.flatMap(event => {
                if (event.source !== 'student') return [];
                try {
                    const value: unknown = JSON.parse(event.payload);
                    if (typeof value !== 'object' || value === null) return [];
                    const entry = value as Record<string, unknown>;
                    if (entry.diagnosisId !== diagnosis.id || typeof entry.question !== 'string' || typeof entry.answer !== 'string') return [];
                    const mode: 'text' | 'option' | 'unknown' = entry.mode === 'unknown' || entry.mode === 'option' ? entry.mode : 'text';
                    return [{ question: entry.question, answer: entry.answer, mode }];
                } catch { return []; }
            });
            if (turns.length >= 3) throw new Error('GAP_FOLLOWUP_LIMIT');
            const previousAi = [...prior].reverse().find(event => event.source === 'ai');
            let question = candidate.questionsToStudent[0];
            if (previousAi) {
                try {
                    const value: unknown = JSON.parse(previousAi.payload);
                    if (typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).nextQuestion === 'string')
                        question = (value as { nextQuestion: string }).nextQuestion;
                } catch { /* 旧事件保持默认追问 */ }
            }
            const limited = await consumeAiQuota(user, 'analyze');
            if (limited) return limited;
            const dialogue = [...turns, { question, answer: body.answer, mode: body.mode }];
            const result = GapResultSchema.parse(await getAIService().diagnoseKnowledgeGaps({
                questionText: item.questionText || '', wrongAnswerText: item.wrongAnswerText || '',
                answerText: item.answerText || '', analysis: item.analysis || '', ...scope,
                language: body.language, units: [{ name: candidate.unitName, triggerRule: candidate.triggerRule, boundary: candidate.boundary }], dialogue,
            }));
            const nextQuestion = result.status === 'needs_more_information' ? result.questions[0] : result.diagnoses[0]?.questionsToStudent[0];
            const hypothesis = result.status === 'candidate_diagnosis' ? result.diagnoses[0]?.hypothesis : null;
            await prisma.$transaction(async tx => {
                await recordLearningEvent(tx, { userId: user.id, unitId: diagnosis.unitId, requestId: `followup:${body.requestId}:student`,
                    kind: 'diagnostic_reply', source: 'student', errorItemId: id,
                    payload: { diagnosisId: diagnosis.id, question, answer: body.answer, mode: body.mode } });
                await recordLearningEvent(tx, { userId: user.id, unitId: diagnosis.unitId, requestId: `followup:${body.requestId}:ai`,
                    kind: 'diagnostic_reply', source: 'ai', errorItemId: id,
                    payload: { diagnosisId: diagnosis.id, hypothesis: hypothesis ?? '', nextQuestion: nextQuestion ?? '', confidence: 'unconfirmed' } });
            });
            return NextResponse.json({ nextQuestion: nextQuestion || null, hypothesis, turns: dialogue.length, confirmed: false });
        }
        if (body.action === 'generate' || body.action === 'manual') {
            let candidates;
            if (body.action === 'generate') {
                if (!item.questionText?.trim() || !item.wrongAnswerText?.trim()) return NextResponse.json({ status: 'needs_more_information', reason: 'GAP_NEEDS_WORK', questions: [] });
                const limited = await consumeAiQuota(user, 'analyze');
                if (limited) return limited;
                const units = await prisma.knowledgeUnit.findMany({ where: { userId: user.id, ...scope }, select: { name: true, triggerRule: true, boundary: true }, take: 50, orderBy: { createdAt: 'desc' } });
                const result = GapResultSchema.parse(await getAIService().diagnoseKnowledgeGaps({
                    questionText: item.questionText, wrongAnswerText: item.wrongAnswerText,
                    answerText: item.answerText || '', analysis: item.analysis || '', ...scope, language: body.language, units,
                }));
                if (result.status === 'needs_more_information') return NextResponse.json(result);
                candidates = result.diagnoses;
            } else candidates = [body.candidate];
            await prisma.$transaction(async tx => {
                const current = await tx.errorItem.findFirst({ where: { id, userId: user.id }, include: { subject: true } });
                if (!current || gapDigest(current) !== gapDigest(item)) throw new Error('GAP_STALE');
                for (const candidate of candidates) await saveGap(tx, item, scope, candidate, body.action === 'manual' ? 'manual' : 'ai');
            });
            return NextResponse.json({ status: 'candidate_diagnosis' });
        }
        await prisma.$transaction(async tx => {
            const diagnosis = await tx.gapDiagnosis.findFirst({ where: { id: body.diagnosisId, errorItemId: id, errorItem: { userId: user.id }, unit: { userId: user.id } }, include: { errorItem: { include: { subject: true } } } });
            if (!diagnosis) throw new Error('GAP_NOT_FOUND');
            if (body.action === 'split') {
                const candidate = GapCandidateSchema.parse(JSON.parse(diagnosis.payload));
                const identity = { userId: user.id, ...scope, unitKey: gapUnitKey(candidate) };
                const ownUnit = await tx.knowledgeUnit.upsert({ where: { userId_stage_subject_unitKey: identity }, update: {},
                    create: { ...identity, name: candidate.unitName, triggerRule: candidate.triggerRule, boundary: candidate.boundary } });
                await tx.gapDiagnosis.update({ where: { id: diagnosis.id }, data: { unitId: ownUnit.id, status: 'candidate', practiceReviewed: false } });
                const related = await tx.learningEvent.findMany({ where: { unitId: diagnosis.unitId, errorItemId: id } });
                for (const event of related) {
                    if (event.payload.includes(`"diagnosisId":"${diagnosis.id}"`))
                        await tx.learningEvent.update({ where: { id: event.id }, data: { unitId: ownUnit.id } });
                }
                return;
            }
            if (body.action === 'status' && body.status !== 'confirmed') {
                await tx.gapDiagnosis.update({ where: { id: diagnosis.id }, data: { status: body.status, practiceReviewed: false } });
                return;
            }
            if (diagnosis.sourceDigest !== gapDigest(diagnosis.errorItem)) throw new Error('GAP_STALE');
            if (body.action === 'status') {
                await tx.gapDiagnosis.update({ where: { id: diagnosis.id }, data: { status: body.status } });
                return;
            }
            if (diagnosis.status !== 'confirmed') throw new Error('GAP_CONFIRM_FIRST');
            if (body.action === 'approve_practice') {
                await tx.gapDiagnosis.update({ where: { id: diagnosis.id }, data: { practiceReviewed: true } });
                return;
            }
            if (!diagnosis.practiceReviewed) throw new Error('GAP_REVIEW_FIRST');
            const candidate = GapCandidateSchema.parse(JSON.parse(diagnosis.payload));
            const drill = candidate.minimalPractice[body.practiceIndex];
            if (!drill) throw new Error('GAP_INVALID_DATA');
            // 查看参考答案后的自评只能作练习记录；完全匹配答案才可计独立通过。
            const independent = body.result === 'correct' && normalizeGapText(body.answer) === normalizeGapText(drill.answer);
            await tx.unitPracticeEvent.upsert({
                where: { diagnosisId_requestId: { diagnosisId: diagnosis.id, requestId: body.requestId } }, update: {},
                create: { diagnosisId: diagnosis.id, requestId: body.requestId, practiceIndex: body.practiceIndex, answer: body.answer, result: body.result, independent },
            });
            await recordLearningEvent(tx, {
                userId: user.id, unitId: diagnosis.unitId, requestId: `unit:${diagnosis.id}:${body.requestId}`,
                kind: 'answer', source: 'student', errorItemId: id,
                questionKey: questionContextKey(drill.question), result: body.result === 'incorrect' ? 'wrong' : body.result,
                independent, payload: { diagnosisId: diagnosis.id, practiceIndex: body.practiceIndex, practiceType: drill.type },
            });
        });
        return NextResponse.json({ success: true });
    } catch (error) { return handleFailure(error); }
}
