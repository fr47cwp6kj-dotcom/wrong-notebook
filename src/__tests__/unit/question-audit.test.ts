import { describe, it, expect, vi } from 'vitest';
import { auditGeneratedQuestion, generateAuditedQuestion } from '@/lib/ai/question-audit';
import type { AIService, ParsedQuestion } from '@/lib/ai/types';

function makeQuestion(questionText: string, answerText: string): ParsedQuestion {
    return { questionText, answerText, analysis: '解析内容', figureSvg: null } as ParsedQuestion;
}

function makeService(reviewAnswer: string, semanticallyCorrect = false) {
    return {
        reanswerQuestion: vi.fn().mockResolvedValue(makeQuestion('复核题干', reviewAnswer)),
        gradeAnswer: vi.fn().mockResolvedValue({ correct: semanticallyCorrect, reason: '等价结论' }),
    } as unknown as AIService;
}

describe('auditGeneratedQuestion', () => {
    it('内容缺失或与原题相同时抛出 AI_QUESTION_INVALID', async () => {
        const service = makeService('42');
        await expect(auditGeneratedQuestion(service, makeQuestion('', '1'), '原题', 'zh', null))
            .rejects.toThrow('AI_QUESTION_INVALID');
        await expect(auditGeneratedQuestion(service, makeQuestion('  原题  ', '1'), '原题', 'zh', null))
            .rejects.toThrow('AI_QUESTION_INVALID');
    });

    it('纯计算题答案与程序验算不符时抛出 AI_QUESTION_WRONG_ANSWER', async () => {
        const service = makeService('42');
        await expect(auditGeneratedQuestion(service, makeQuestion('计算：2 + 3 × 4', '15'), '原题', 'zh', null))
            .rejects.toThrow('AI_QUESTION_WRONG_ANSWER');
    });

    it('纯计算题验算通过时不调用独立复核', async () => {
        const service = makeService('999');
        const mode = await auditGeneratedQuestion(service, makeQuestion('计算：2 + 3 × 4', '14'), '原题', 'zh', null);
        expect(mode).toBe('programmatic');
        expect(service.reanswerQuestion).not.toHaveBeenCalled();
    });

    it('独立复核答案不一致时抛出 AI_QUESTION_REVIEW_FAILED', async () => {
        const service = makeService('与生成答案不同的结果');
        await expect(auditGeneratedQuestion(service, makeQuestion('阅读题干', '生成答案'), '原题', 'zh', null))
            .rejects.toThrow('AI_QUESTION_REVIEW_FAILED');
    });

    it('复核写法不同但语义判定等价时通过', async () => {
        const service = makeService('16 - 6 = 10cm', true);
        const mode = await auditGeneratedQuestion(service, makeQuestion('求 BD 的长度', '10 cm'), '原题', 'zh', null);
        expect(mode).toBe('semantic_ai');
        expect(service.gradeAnswer).toHaveBeenCalledWith(expect.objectContaining({
            questionText: '求 BD 的长度', answerText: '10 cm', userAnswer: '16 - 6 = 10cm',
        }));
    });
});

describe('generateAuditedQuestion 按场景区分处理', () => {
    const original = '原题';

    it('复核不一致时自动重新生成，第二次通过则成功返回', async () => {
        const service = makeService('生成答案');
        const generate = vi.fn()
            .mockResolvedValueOnce(makeQuestion('第一次与原题相同', '1'))   // AI_QUESTION_INVALID → 重试
            .mockResolvedValueOnce(makeQuestion('阅读新题干', '生成答案'));  // 复核一致 → 通过
        const result = await generateAuditedQuestion(service, original, 'zh', null, generate);
        expect(result.questionText).toBe('阅读新题干');
        expect(generate).toHaveBeenCalledTimes(2);
    });

    it('验算不符属于可重试错误，重试后通过则成功返回', async () => {
        const service = makeService('14');
        const generate = vi.fn()
            .mockResolvedValueOnce(makeQuestion('计算：2 + 3 × 4', '99'))  // WRONG_ANSWER → 重试
            .mockResolvedValueOnce(makeQuestion('计算：2 + 3 × 4', '14')); // 验算通过
        const result = await generateAuditedQuestion(service, original, 'zh', null, generate);
        expect(result.answerText).toBe('14');
        expect(generate).toHaveBeenCalledTimes(2);
    });

    it('连续未通过时抛出最后一次的错误码供前端分场景提示', async () => {
        const service = makeService('另一个答案');
        const generate = vi.fn().mockResolvedValue(makeQuestion('阅读新题干', '生成答案'));
        await expect(generateAuditedQuestion(service, original, 'zh', null, generate))
            .rejects.toThrow('AI_QUESTION_REVIEW_FAILED');
        expect(generate).toHaveBeenCalledTimes(2); // 默认 retries = 1
    });

    it('网络、鉴权等不可重试错误立即抛出，不再消耗生成次数', async () => {
        const service = makeService('生成答案');
        const generate = vi.fn().mockRejectedValue(new Error('AI_CONNECTION_FAILED'));
        await expect(generateAuditedQuestion(service, original, 'zh', null, generate))
            .rejects.toThrow('AI_CONNECTION_FAILED');
        expect(generate).toHaveBeenCalledTimes(1);
    });
});
