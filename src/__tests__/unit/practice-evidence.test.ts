import { describe, expect, it } from 'vitest';
import { practiceEvidence } from '@/lib/practice-evidence';

describe('练习作答证据', () => {
    it('独立作答并判对才算独立正确', () => {
        expect(practiceEvidence('correct', 'correct', true)).toEqual({ result: 'correct', hintUsed: false });
    });

    it('直接查看答案后自报正确不算独立通过', () => {
        expect(practiceEvidence(null, 'correct', false)).toEqual({ result: 'correct', hintUsed: true });
    });

    it('判错后查看答案再改为正确不算独立通过', () => {
        expect(practiceEvidence('wrong', 'correct', false)).toEqual({ result: 'correct', hintUsed: true });
    });

    it('提示后正确不算独立通过', () => {
        expect(practiceEvidence('correct', 'correct', true, 2)).toEqual({ result: 'correct', hintUsed: true });
    });
});
