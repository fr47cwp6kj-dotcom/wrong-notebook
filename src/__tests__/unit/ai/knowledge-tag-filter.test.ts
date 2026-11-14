import { describe, expect, it } from 'vitest';
import { filterKnowledgeTags } from '@/lib/ai/knowledge-tag-filter';

describe('AI 标签范围过滤', () => {
    it('单题空映射保留候选范围内的总标签，范围外的标签不会回填', () => {
        expect(filterKnowledgeTags({ knowledgePoints: ['全等三角形', '最值问题'], questionKnowledgePoints: {} }, ['全等三角形'])).toEqual({
            knowledgePoints: ['全等三角形'], questionKnowledgePoints: undefined,
        });
    });

    it('分题过滤并完整汇总，某题无匹配时保持空白', () => {
        const result = filterKnowledgeTags({ knowledgePoints: ['旧标签'], questionKnowledgePoints: {
            '15': ['轴对称图形', '轴对称最短路径', '全等三角形'],
            '16': ['一次函数', '不等式', '坐标'],
            '17': ['最值问题'],
        } }, ['轴对称图形', '轴对称最短路径', '全等三角形', '一次函数', '不等式', '坐标']);
        expect(result.knowledgePoints).toEqual(['轴对称图形', '轴对称最短路径', '全等三角形', '一次函数', '不等式', '坐标']);
        expect(result.questionKnowledgePoints).toMatchObject({ '17': [] });
    });

    it('没有候选时不保留 AI 自创标签', () => {
        expect(filterKnowledgeTags({ knowledgePoints: ['猜测'] }, []).knowledgePoints).toEqual([]);
    });
});
