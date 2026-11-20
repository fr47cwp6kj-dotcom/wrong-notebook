import type { PracticeResult } from '@/lib/ai/types';

/** 完整答案公开后才改判为正确，不能算作独立掌握。 */
export function practiceEvidence(suggested: PracticeResult | null, selected: PracticeResult, independentCorrect: boolean, hintLevel = 0) {
    return {
        result: selected,
        hintUsed: hintLevel > 0 || (selected === 'correct' && !(independentCorrect && suggested === 'correct')),
    };
}
