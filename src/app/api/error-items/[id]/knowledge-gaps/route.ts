import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { badRequest, internalError, notFound, unauthorized } from '@/lib/api-errors';
import { getAIService } from '@/lib/ai';
import { consumeAiQuota } from '@/lib/ai-quota';
import { GapCandidateSchema, GapResultSchema, GAP_STATUSES } from '@/lib/knowledge-gaps';
import { gapDigest, saveGap } from '@/lib/knowledge-gap-store';
import { createLogger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/error-message';

const logger = createLogger('api:knowledge-gaps');
type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().min(1).max(200);
const BodySchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('generate'), reviewedInput: z.literal(true), language: z.enum(['zh', 'en']).default('zh') }),
    z.object({ action: z.literal('manual'), candidate: GapCandidateSchema }),
    z.object({ action: z.literal('status'), diagnosisId: idSchema, status: z.enum(GAP_STATUSES) }),
    z.object({ action: z.literal('approve_practice'), diagnosisId: idSchema }),
    z.object({ action: z.literal('practice'), diagnosisId: idSchema, practiceIndex: z.number().int().min(0).max(2), requestId: z.string().uuid(), answer: z.string().trim().min(1).max(4000), result: z.enum(['correct', 'partial', 'incorrect']) }),
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
        const item = await prisma.errorItem.findFirst({ where: { id, userId: user.id }, include: { subject: true, gapDiagnoses: { include: { events: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } } } });
        if (!item) return notFound();
        return NextResponse.json({ diagnoses: item.gapDiagnoses.map(({ payload, sourceDigest, ...diagnosis }) => ({
            ...diagnosis, stale: sourceDigest !== gapDigest(item), candidate: GapCandidateSchema.parse(JSON.parse(payload)),
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
            if (!candidate.minimalPractice[body.practiceIndex]) throw new Error('GAP_INVALID_DATA');
            await tx.unitPracticeEvent.upsert({
                where: { diagnosisId_requestId: { diagnosisId: diagnosis.id, requestId: body.requestId } }, update: {},
                create: { diagnosisId: diagnosis.id, requestId: body.requestId, practiceIndex: body.practiceIndex, answer: body.answer, result: body.result },
            });
        });
        return NextResponse.json({ success: true });
    } catch (error) { return handleFailure(error); }
}
