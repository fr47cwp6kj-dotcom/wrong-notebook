import { describe, expect, it } from 'vitest';
import { shouldAutoDiagnoseKnowledgeGap } from '@/lib/auto-knowledge-gap';

describe('自动知识漏洞诊断', () => {
    it('题干和学生错答齐全时允许自动生成候选知识单元', () => {
        expect(shouldAutoDiagnoseKnowledgeGap({ questionText: '解方程 x + 2 = 5', wrongAnswerText: 'x = 7' })).toBe(true);
    });

    it('缺少学生错答时不允许 AI 猜测漏洞', () => {
        expect(shouldAutoDiagnoseKnowledgeGap({ questionText: '解方程 x + 2 = 5', wrongAnswerText: '' })).toBe(false);
    });
});
