export type VerificationStage = 'pending' | 'preliminary' | 'cross_context' | 'temporary' | 'stable';

export interface GrowthAdviceUnit {
    id: string;
    name: string;
    verificationStage: VerificationStage;
    attempts: number;
    contexts: number;
    questions: Array<{ id: string }>;
}

const stagePriority: Record<VerificationStage, number> = {
    pending: 0,
    preliminary: 1,
    cross_context: 2,
    temporary: 3,
    stable: 4,
};

/** 将已有学习证据翻译成学生能立即执行的一条建议，不推断未记录的能力。 */
export function buildGrowthAdvice(units: GrowthAdviceUnit[], reviewCount: number) {
    const active = units.filter(unit => stagePriority[unit.verificationStage] < stagePriority.temporary)
        .sort((left, right) => stagePriority[left.verificationStage] - stagePriority[right.verificationStage]
            || left.contexts - right.contexts || left.attempts - right.attempts);
    const priorityUnit = active[0] ?? null;
    const progressUnit = [...units].filter(unit => unit.verificationStage === 'temporary' || unit.verificationStage === 'stable')
        .sort((left, right) => right.contexts - left.contexts || right.attempts - left.attempts)[0] ?? null;

    return {
        priorityUnit,
        progressUnit,
        reviewCount,
        dataStatus: units.length === 0 ? 'empty' : priorityUnit ? 'needs_verification' : 'consolidating',
        nextHref: priorityUnit?.questions[0] ? `/practice?id=${encodeURIComponent(priorityUnit.questions[0].id)}` : priorityUnit ? '/knowledge-units' : reviewCount > 0 ? '/review' : '/entry',
    };
}
