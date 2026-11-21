import type { AIService, ParsedQuestion } from './types';
import { matchAnswer, normalizeAnswer } from '@/lib/answer-match';
import { normalizeGapText } from '@/lib/knowledge-gaps';

/** 仅解析纯四则运算，不执行任意代码。无法程序证明的题目交由独立求解复核。 */
function arithmeticValue(source: string): number | null {
    const cleaned = source.replace(/[×÷]/g, symbol => symbol === '×' ? '*' : '/').replace(/\s+/g, '');
    if (!/^[\d.+\-*/()]+$/.test(cleaned)) return null;
    const tokens = cleaned.match(/\d+(?:\.\d+)?|[()+\-*/]/g);
    if (!tokens || tokens.join('') !== cleaned) return null;
    let index = 0;
    const factor = (): number => {
        const token = tokens[index++];
        if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * factor();
        if (token === '(') {
            const value = expression();
            if (tokens[index++] !== ')') throw new Error('MATH_PARENTHESES');
            return value;
        }
        const number = Number(token);
        if (!Number.isFinite(number)) throw new Error('MATH_NUMBER');
        return number;
    };
    const term = (): number => {
        let value = factor();
        while (tokens[index] === '*' || tokens[index] === '/') {
            const operator = tokens[index++];
            const right = factor();
            value = operator === '*' ? value * right : value / right;
        }
        return value;
    };
    const expression = (): number => {
        let value = term();
        while (tokens[index] === '+' || tokens[index] === '-') {
            const operator = tokens[index++];
            const right = term();
            value = operator === '+' ? value + right : value - right;
        }
        return value;
    };
    try {
        const result = expression();
        return index === tokens.length && Number.isFinite(result) ? result : null;
    } catch { return null; }
}

function simpleCalculation(question: string): number | null {
    const match = question.trim().match(/^(?:计算|求值|compute|evaluate)\s*[:：]?\s*([\d.+\-*/×÷()\s]+)[。.]?$/iu);
    return match ? arithmeticValue(match[1]) : null;
}

/** 错答、缺解和重复题禁止入库；简单算式程序校验，其余题独立求解复核。 */
export async function auditGeneratedQuestion(service: AIService, generated: ParsedQuestion, original: string, language: 'zh' | 'en', subject: string | null) {
    if (!generated.questionText.trim() || !generated.answerText.trim() || !generated.analysis.trim()
        || normalizeGapText(generated.questionText) === normalizeGapText(original)) throw new Error('AI_QUESTION_INVALID');
    const calculated = simpleCalculation(generated.questionText);
    if (calculated !== null) {
        const answer = Number(normalizeAnswer(generated.answerText));
        if (!Number.isFinite(answer) || Math.abs(answer - calculated) > 1e-8) throw new Error('AI_QUESTION_WRONG_ANSWER');
        return 'programmatic' as const;
    }
    const reviewed = await service.reanswerQuestion(generated.questionText, language, subject);
    if (matchAnswer(reviewed.answerText, generated.answerText) !== true) {
        // 第二次解题常把“最终答案”写成等价的计算式。交给现有判题器比较语义，
        // 仅在它也确认不等价时才拒绝，避免格式和解题侧重点造成假失败。
        const equivalent = await service.gradeAnswer({
            questionText: generated.questionText,
            answerText: generated.answerText,
            analysis: generated.analysis,
            userAnswer: reviewed.answerText,
            language,
        });
        if (!equivalent.correct) throw new Error('AI_QUESTION_REVIEW_FAILED');
        return 'semantic_ai' as const;
    }
    return 'independent_ai' as const;
}

/** 单次生成质量问题（与原题相同、验算不符、复核不一致）重新生成即可恢复，其余错误立即抛出 */
const RETRYABLE_AUDIT_ERRORS = new Set(['AI_QUESTION_INVALID', 'AI_QUESTION_WRONG_ANSWER', 'AI_QUESTION_REVIEW_FAILED']);

/**
 * 生成并审核一道变式题：审核未通过时按场景区分处理。
 * 可重试的质量错误会自动重新生成（默认重试一次，对使用者透明）；
 * 连续未通过或遇到网络、鉴权等不可重试错误时，抛出最后一次的具体错误码供前端分场景提示。
 */
export async function generateAuditedQuestion(
    service: AIService,
    original: string,
    language: 'zh' | 'en',
    subject: string | null,
    generate: () => Promise<ParsedQuestion>,
    { retries = 1 }: { retries?: number } = {},
): Promise<ParsedQuestion> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const generated = await generate();
        try {
            await auditGeneratedQuestion(service, generated, original, language, subject);
            return generated;
        } catch (error) {
            lastError = error;
            const code = error instanceof Error ? error.message : String(error);
            if (!RETRYABLE_AUDIT_ERRORS.has(code)) throw error;
        }
    }
    throw lastError;
}
