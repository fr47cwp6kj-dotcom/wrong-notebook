import { createHash } from 'node:crypto';
import type { ErrorItem, Prisma } from '@prisma/client';
import { GapCandidateSchema, normalizeGapText, validateGapEvidence } from './knowledge-gaps';
import type { GapCandidate } from './knowledge-gaps';

type GapItem = Pick<ErrorItem, 'id' | 'userId' | 'questionText' | 'wrongAnswerText' | 'answerText' | 'analysis' | 'gradeSemester'> & {
    subject?: { stage: string; subjectKey: string | null; name: string } | null;
};
export const gapDigest = (item: GapItem) => createHash('sha256').update(JSON.stringify([
    item.questionText || '', item.wrongAnswerText || '', item.answerText || '', item.analysis || '',
    item.gradeSemester || '', item.subject?.stage || '', item.subject?.subjectKey || item.subject?.name || '',
])).digest('hex');

export function gapUnitKey(candidate: GapCandidate) {
    return createHash('sha256').update(JSON.stringify([candidate.unitName, candidate.triggerRule, candidate.boundary].map(normalizeGapText))).digest('hex');
}

export async function saveGap(tx: Prisma.TransactionClient, item: GapItem, scope: { stage: string; subject: string }, candidate: GapCandidate, source: 'ai' | 'manual') {
    GapCandidateSchema.parse(candidate);
    validateGapEvidence(candidate, { questionText: item.questionText || '', wrongAnswerText: item.wrongAnswerText || '' });
    const identity = { userId: item.userId, stage: scope.stage, subject: scope.subject, unitKey: gapUnitKey(candidate) };
    const unit = await tx.knowledgeUnit.upsert({
        where: { userId_stage_subject_unitKey: identity }, update: {},
        create: { ...identity, name: candidate.unitName, triggerRule: candidate.triggerRule, boundary: candidate.boundary },
    });
    return tx.gapDiagnosis.create({ data: {
        errorItemId: item.id, unitId: unit.id, payload: JSON.stringify(candidate),
        source, sourceDigest: gapDigest(item), status: 'candidate', practiceReviewed: false,
    } });
}
