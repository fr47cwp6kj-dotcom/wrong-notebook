import { describe, expect, it } from 'vitest';
import { parseWrongAnswerText } from '@/lib/ai/schema';
import { generateWrongAnswerPrompt } from '@/lib/ai/prompts';

describe('parseWrongAnswerText', () => {
    it('原样保留摘录文本，「无」和空白视为未识别', () => {
        expect(parseWrongAnswerText('  x = 7  ')).toBe('x = 7');
        expect(parseWrongAnswerText('无')).toBe('');
        expect(parseWrongAnswerText('   ')).toBe('');
        expect(parseWrongAnswerText(null)).toBe('');
        expect(parseWrongAnswerText(undefined)).toBe('');
    });
});

describe('generateWrongAnswerPrompt', () => {
    it('包含题目文字与摘录规则，要求输出 wrong_answer_text 标签', () => {
        const prompt = generateWrongAnswerPrompt('求解 x + 2 = 5');
        expect(prompt).toContain('求解 x + 2 = 5');
        expect(prompt).toContain('<wrong_answer_text>');
        expect(prompt).toContain('只摘录学生的手写内容');
    });

    it('无题目文字时给出占位说明', () => {
        expect(generateWrongAnswerPrompt(null)).toContain('无题目文字');
    });
});
