import { describe, expect, it } from 'vitest';
import { getCorrectionQuestionNumbers, getNumberedSections, replaceSectionBody } from '@/lib/correction-sections';

describe('校对内容按题号分组', () => {
    it('匹配题干、紧接小问的答案和加粗解析中的相同题号', () => {
        const draft = {
            questionText: '15. 求面积。\n\n16. 作图。\n（1）画对称点。\n（2）求最小值。',
            answerText: '15. 3。\n16.（1）连接两点。\n（2）12。',
            analysis: '**15.**\n面积相减。\n\n**16.**\n利用轴对称。',
        };
        expect(getCorrectionQuestionNumbers(draft)).toEqual(['15', '16']);
        expect(getNumberedSections(draft.answerText).map(s => s.body)).toEqual(['3。', '（1）连接两点。\n（2）12。']);
        expect(getNumberedSections(draft.analysis).map(s => s.body)).toEqual(['面积相减。', '利用轴对称。']);
    });

    it('支持中文、英文标题和全角标点，允许跨题号', () => {
        expect(getCorrectionQuestionNumbers({
            questionText: '共用条件。\n\n## 第 3 题\n求面积。\n\n### Question 7: 求周长。', answerText: '', analysis: '',
        })).toEqual(['3', '7']);
        expect(getNumberedSections('3．答案甲\n7、答案乙').map(s => s.number)).toEqual(['3', '7']);
    });

    it('不把一题的条件、小问、解题步骤或小数当作独立题目', () => {
        expect(getCorrectionQuestionNumbers({questionText:'已知条件：\n1. 边长为 3。\n2. 高为 4。\n求面积。', answerText:'6', analysis:'1. 代入公式。\n2. 化简。'})).toEqual([]);
        expect(getNumberedSections('（1）第一小问\n(2) 第二小问\n3.14 是近似值。\n  1. 嵌套步骤')).toEqual([]);
    });

    it('忽略代码块和独立公式中的数字行', () => {
        const text = '```text\n15. 示例\n16. 示例\n```\n$$\n17. x = 1\n$$\n\\[\n18. y = 2\n\\]\n第19题：真正的题目';
        expect(getNumberedSections(text).map(s => s.number)).toEqual(['19']);
    });

    it('重复题号无法明确对应时退回全文', () => {
        expect(getCorrectionQuestionNumbers({questionText:'第1题\n甲\n第1题\n乙', answerText:'', analysis:''})).toEqual([]);
    });

    it('为原本空白的一题补充内容时不会与下一题的编号粘连', () => {
        const text = '**15.**\n**16.**\n下一题';
        expect(replaceSectionBody(text, getNumberedSections(text)[0], '补充解析')).toBe('**15.**\n补充解析\n**16.**\n下一题');
    });

    it('修改一题正文时保留题号、公共说明、换行和其他题目原文', () => {
        const text = '共用说明\r\n\r\n**15.**\r\n原解析\r\n\r\n**16.**\r\n下一题解析\r\n';
        const sections = getNumberedSections(text);
        expect(replaceSectionBody(text, sections[0], '新解析\n$\\frac{1}{2}$')).toBe('共用说明\r\n\r\n**15.**\r\n新解析\n$\\frac{1}{2}$\r\n\r\n**16.**\r\n下一题解析\r\n');
        expect(replaceSectionBody(text, sections[0], sections[0].body)).toBe(text);
    });
});
