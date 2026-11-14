import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { GapCandidateSchema, GAP_STATUSES } from './knowledge-gaps';
import { gapUnitKey } from './knowledge-gap-store';

const eventSchema = z.object({ requestId: z.string().uuid(), practiceIndex: z.number().int().min(0).max(2), answer: z.string().trim().min(1).max(4000), result: z.enum(['correct', 'partial', 'incorrect']), createdAt: z.coerce.date() });
const backupSchema = z.array(z.object({
    originId: z.string().uuid(), payload: z.string().max(60000), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    source: z.enum(['ai', 'manual']), status: z.enum(GAP_STATUSES), practiceReviewed: z.boolean(),
    createdAt: z.coerce.date(), updatedAt: z.coerce.date(), events: z.array(eventSchema).max(10000),
    unit: z.object({ stage: z.string().min(1).max(100), subject: z.string().min(1).max(100) }),
})).max(500);

/** 外部 ID 只用于幂等映射；用户与题目所有权由已验证的目标题目决定。 */
export async function restoreKnowledgeGaps(tx: Prisma.TransactionClient, errorItemId: string, userId: string, raw: unknown) {
    if (raw === undefined) return;
    const entries = backupSchema.parse(raw);
    const item = await tx.errorItem.findFirst({ where: { id: errorItemId, userId } });
    if (!item) throw new Error('GAP_NOT_FOUND');
    for (const entry of entries) {
        const candidate = GapCandidateSchema.parse(JSON.parse(entry.payload));
        const identity = { userId, ...entry.unit, unitKey: gapUnitKey(candidate) };
        const unit = await tx.knowledgeUnit.upsert({
            where: { userId_stage_subject_unitKey: identity }, update: {},
            create: { ...identity, name: candidate.unitName, triggerRule: candidate.triggerRule, boundary: candidate.boundary },
        });
        const diagnosis = await tx.gapDiagnosis.upsert({
            where: { errorItemId_originId: { errorItemId, originId: entry.originId } }, update: {},
            create: {
                errorItemId, unitId: unit.id, originId: entry.originId, payload: JSON.stringify(candidate),
                sourceDigest: entry.sourceDigest, source: entry.source, status: entry.status,
                practiceReviewed: entry.status === 'confirmed' && entry.practiceReviewed,
                createdAt: entry.createdAt, updatedAt: entry.updatedAt,
            },
        });
        for (const event of entry.events) {
            if (!candidate.minimalPractice[event.practiceIndex]) throw new Error('GAP_INVALID_DATA');
            await tx.unitPracticeEvent.upsert({
                where: { diagnosisId_requestId: { diagnosisId: diagnosis.id, requestId: event.requestId } }, update: {},
                create: { ...event, diagnosisId: diagnosis.id },
            });
        }
    }
}
