import type { GapCandidate } from '@/lib/knowledge-gaps';

export const gapFixture: GapCandidate = {
    unitName: '移项与等式两边同减', triggerRule: '看到等式一侧有加数，想到两侧同减', boundary: '等式两边执行相同运算',
    surfaceReason: '符号错误', gapType: 'formula_condition_misapplied', firstStuckStep: '移项时仍然相加', unusedSignal: '等号两边应同减',
    hypothesis: '可能未理解移项的等价变形', evidenceSource: 'wrongAnswerText', evidenceQuote: 'x = 7',
    questionsToStudent: ['等式两边要同时减去哪个数？'],
    minimalPractice: [{ type: 'unit_drill', question: 'x + 3 = 8，两边应做什么运算？', answer: '同时减 3', explanation: '保持等式两边相等' }],
};
