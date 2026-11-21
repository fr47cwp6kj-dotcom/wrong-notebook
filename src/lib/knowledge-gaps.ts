import { z } from 'zod';

export const GAP_TYPES = ['condition_signal_missed', 'concept_definition_unstable', 'formula_condition_misapplied', 'unit_connection_missing', 'representation_conversion_failed', 'strategy_selection_missing', 'execution_slip', 'other', 'uncertain'] as const;
export const GAP_STATUSES = ['candidate', 'confirmed', 'rejected', 'uncertain'] as const;
const requiredText = z.string().trim().min(1).max(2000);

export const GapCandidateSchema = z.object({
    unitName: requiredText.max(120),
    triggerRule: requiredText,
    boundary: requiredText,
    surfaceReason: requiredText,
    gapType: z.enum(GAP_TYPES),
    firstStuckStep: z.string().trim().max(2000),
    unusedSignal: z.string().trim().max(2000),
    hypothesis: requiredText,
    evidenceSource: z.enum(['questionText', 'wrongAnswerText']),
    evidenceQuote: requiredText,
    questionsToStudent: z.array(requiredText).min(1).max(3),
    minimalPractice: z.array(z.object({
        type: z.enum(['trigger_recognition', 'unit_drill', 'boundary_contrast']),
        question: requiredText,
        answer: requiredText,
        explanation: requiredText,
    })).min(1).max(3),
}).refine(value => value.firstStuckStep || value.unusedSignal, { message: 'GAP_MISSING_LOCATION' });

export const GapResultSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('candidate_diagnosis'), diagnoses: z.array(GapCandidateSchema).min(1).max(5) }),
    z.object({ status: z.literal('needs_more_information'), reason: requiredText, questions: z.array(requiredText).min(1).max(3) }),
]);
export type GapCandidate = z.infer<typeof GapCandidateSchema>;
export type GapResult = z.infer<typeof GapResultSchema>;
export interface GapInput {
    questionText: string;
    wrongAnswerText: string;
    answerText: string;
    analysis: string;
    stage: string;
    subject: string;
    language: 'zh' | 'en';
    units: Array<{ name: string; triggerRule: string; boundary: string }>;
    /** 原题图片仅作为题干图示证据，不得当作学生原始作答。 */
    imageDataUrl?: string;
    dialogue?: Array<{ question: string; answer: string; mode: 'text' | 'option' | 'unknown' }>;
}

export function parseGapImageDataUrl(value: string | undefined): { mimeType: string; base64: string } | null {
    const match = value?.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([\s\S]+)$/i);
    return match ? { mimeType: match[1].toLowerCase(), base64: match[2] } : null;
}
export const normalizeGapText = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** 引用必须能回到当前题干或学生作答；模型生成的解析不能冒充作答证据。 */
export function validateGapEvidence(candidate: GapCandidate, input: Pick<GapInput, 'questionText' | 'wrongAnswerText'>) {
    const source = normalizeGapText(input[candidate.evidenceSource]);
    if (!source.includes(normalizeGapText(candidate.evidenceQuote))) throw new Error('GAP_EVIDENCE_MISMATCH');
}

export interface GapView {
    id: string;
    status: typeof GAP_STATUSES[number];
    source: string;
    stale: boolean;
    practiceReviewed: boolean;
    merged?: boolean;
    unitId: string;
    candidate: GapCandidate;
    events: Array<{ id: string; practiceIndex: number; answer: string; result: string; createdAt: string }>;
    followups?: Array<{ source: string; question?: string; answer?: string; hypothesis?: string; nextQuestion?: string }>;
}

/** 同一原题反复答对不视为迁移掌握；必须在至少两个题目情境中连续通过。 */
export function summarizeUnitEvents(events: Array<{ result: string; errorItemId: string; createdAt: Date | string; independent?: boolean; practiceType?: string }>, completedReviews: Array<Date | string> = []) {
    const sorted = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const streak: typeof sorted = [];
    for (let i = sorted.length - 1; i >= 0 && sorted[i].result === 'correct' && sorted[i].independent === true; i--) streak.push(sorted[i]);
    const contexts = new Set(streak.map(event => event.errorItemId)).size;
    const boundaryVerified = streak.some(event => event.practiceType === 'boundary_contrast');
    const reviewTime = Math.max(0, ...completedReviews.map(value => new Date(value).getTime()).filter(Number.isFinite));
    const reviewVerified = reviewTime > 0 && streak.some(event => new Date(event.createdAt).getTime() > reviewTime);
    const stage = contexts === 0 ? 'pending' : contexts === 1 ? 'preliminary'
        : !boundaryVerified ? 'cross_context' : reviewVerified ? 'stable' : 'temporary';
    return { attempts: sorted.length, correct: sorted.filter(event => event.result === 'correct').length, contexts, stage, mastered: stage === 'temporary' || stage === 'stable' };
}
