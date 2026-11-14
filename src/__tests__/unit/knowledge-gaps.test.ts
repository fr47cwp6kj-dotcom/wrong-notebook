import { describe, expect, it } from 'vitest';
import { GapCandidateSchema, summarizeUnitEvents, validateGapEvidence } from '@/lib/knowledge-gaps';
import { generateGapPrompt } from '@/lib/ai/prompts';
import { gapFixture } from '../fixtures/knowledge-gap';

describe('知识漏洞证据与跨题掌握规则', () => {
    it('拒绝无定位的候选和模型编造的证据', () => {
        expect(GapCandidateSchema.safeParse({ ...gapFixture, firstStuckStep: '', unusedSignal: '' }).success).toBe(false);
        expect(() => validateGapEvidence(gapFixture, { questionText: 'x + 2 = 5', wrongAnswerText: 'x = 7' })).not.toThrow();
        expect(() => validateGapEvidence({ ...gapFixture, evidenceQuote: '他没有学过移项' }, { questionText: 'x + 2 = 5', wrongAnswerText: 'x = 7' })).toThrow('GAP_EVIDENCE_MISMATCH');
    });
    it('单一原题反复通过不足以判为已跨题验证', () => {
        expect(summarizeUnitEvents([1, 2, 3].map(day => ({ result: 'correct', errorItemId: 'q1', createdAt: new Date(2026, 0, day) })))).toMatchObject({ attempts: 3, contexts: 1, mastered: false });
    });
    it('跨两个原题连续独立完成才通过；最新失败重置', () => {
        const history = [{ result: 'correct', errorItemId: 'q1', createdAt: '2026-01-01' }, { result: 'correct', errorItemId: 'q2', createdAt: '2026-01-02' }];
        expect(summarizeUnitEvents(history).mastered).toBe(true);
        expect(summarizeUnitEvents([...history, { result: 'partial', errorItemId: 'q2', createdAt: '2026-01-03' }])).toMatchObject({ mastered: false, contexts: 0 });
    });
    it('共享提示词保留证据、不确定和人工复核要求', () => {
        const prompt = generateGapPrompt({ questionText: '题干', wrongAnswerText: '作答', answerText: '', analysis: '', stage: 'junior_high', subject: 'math', language: 'zh', units: [] });
        expect(prompt).toContain('needs_more_information');
        expect(prompt).toContain('逐字摘录');
        expect(prompt).toContain('待人工复核');
        expect(prompt).toContain('junior_high');
    });
});
