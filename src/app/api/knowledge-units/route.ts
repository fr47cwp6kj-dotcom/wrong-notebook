import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { unauthorized, internalError } from '@/lib/api-errors';
import { GapCandidateSchema, summarizeUnitEvents } from '@/lib/knowledge-gaps';
import { gapDigest, unitTextSimilarity } from '@/lib/knowledge-gap-store';
import { createLogger } from '@/lib/logger';
import { summarizeLearningEvidence } from '@/lib/learning-events';

const logger = createLogger('api:knowledge-units');
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user || !user.isActive) return unauthorized();
        const units = await prisma.knowledgeUnit.findMany({ where: { userId: user.id }, include: { learningEvents: { orderBy: { createdAt: 'asc' } }, diagnoses: {
            where: { errorItem: { userId: user.id } }, include: { errorItem: { include: { subject: true, reviewSchedules: true } }, events: true },
        } }, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ units: units.map(({ diagnoses, learningEvents, ...unit }) => {
            const current = diagnoses.filter(d => d.status === 'confirmed' && d.practiceReviewed && d.sourceDigest === gapDigest(d.errorItem));
            const events = current.flatMap(d => {
                const parsed = GapCandidateSchema.safeParse(JSON.parse(d.payload));
                return d.events.map(e => ({ ...e, errorItemId: d.errorItemId, practiceType: parsed.success ? parsed.data.minimalPractice[e.practiceIndex]?.type : undefined }));
            });
            const completedReviews = current.flatMap(d => d.errorItem.reviewSchedules.map(r => r.completedAt).filter((date): date is Date => date !== null));
            const questions = [...new Map(diagnoses.map(d => [d.errorItemId, { id: d.errorItemId, shortId: d.errorItem.shortId, text: d.errorItem.questionText?.slice(0, 100), status: d.status }])).values()];
            const legacy = summarizeUnitEvents(events, completedReviews);
            const allowedItems = new Set(current.map(d => d.errorItemId));
            const evidence = learningEvents.filter(event => event.errorItemId && allowedItems.has(event.errorItemId));
            const unified = evidence.length ? summarizeLearningEvidence(evidence) : null;
            const verificationStage = unified?.stage ?? legacy.stage;
            const summary = { attempts: unified?.attempts ?? legacy.attempts, correct: legacy.correct,
                contexts: unified?.contexts ?? legacy.contexts, mastered: verificationStage === 'temporary' || verificationStage === 'stable' };
            const confusable = units.filter(other => other.id !== unit.id && other.stage === unit.stage && other.subject === unit.subject
                && unitTextSimilarity(other.triggerRule, unit.triggerRule) >= 0.65
                && unitTextSimilarity(other.boundary, unit.boundary) < 0.94)
                .slice(0, 2).map(other => ({ id: other.id, name: other.name, triggerRule: other.triggerRule, boundary: other.boundary }));
            return { ...unit, ...summary, verificationStage, questions, confusable };
        }) });
    } catch (error) {
        logger.error({ error }, '知识单元读取失败');
        return internalError('GAP_REQUEST_FAILED');
    }
}
