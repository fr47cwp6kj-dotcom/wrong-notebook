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

function characterPairs(value: string): Set<string> {
    const text = normalizeGapText(value).replace(/[\s，。,.；;:：]/g, '');
    return new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2)));
}

export function unitTextSimilarity(left: string, right: string): number {
    const a = characterPairs(left);
    const b = characterPairs(right);
    if (!a.size || !b.size) return normalizeGapText(left) === normalizeGapText(right) ? 1 : 0;
    const overlap = [...a].filter(pair => b.has(pair)).length;
    return 2 * overlap / (a.size + b.size);
}

function boundaryPolarity(value: string): string {
    return [...new Set((normalizeGapText(value).match(/不能|不可|不适用|除非|仅当|只有|not|unless|only/giu) || []))].sort().join('|');
}

export async function saveGap(tx: Prisma.TransactionClient, item: GapItem, scope: { stage: string; subject: string }, candidate: GapCandidate, source: 'ai' | 'manual') {
    GapCandidateSchema.parse(candidate);
    validateGapEvidence(candidate, { questionText: item.questionText || '', wrongAnswerText: item.wrongAnswerText || '' });
    const identity = { userId: item.userId, stage: scope.stage, subject: scope.subject, unitKey: gapUnitKey(candidate) };
    const nearby = await tx.knowledgeUnit.findMany({ where: { userId: item.userId, stage: scope.stage, subject: scope.subject }, take: 100 });
    const semanticMatch = nearby.find(existing => unitTextSimilarity(existing.triggerRule, candidate.triggerRule) >= 0.94
        && unitTextSimilarity(existing.boundary, candidate.boundary) >= 0.94
        && boundaryPolarity(existing.boundary) === boundaryPolarity(candidate.boundary));
    const unit = semanticMatch ?? await tx.knowledgeUnit.upsert({
        where: { userId_stage_subject_unitKey: identity }, update: {},
        create: { ...identity, name: candidate.unitName, triggerRule: candidate.triggerRule, boundary: candidate.boundary },
    });
    return tx.gapDiagnosis.create({ data: {
        errorItemId: item.id, unitId: unit.id, payload: JSON.stringify(candidate),
        source, sourceDigest: gapDigest(item), status: 'candidate', practiceReviewed: false,
    } });
}
