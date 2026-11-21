import { describe, expect, it } from 'vitest';
import { buildGrowthAdvice } from '@/lib/growth-advice';

describe('成长建议', () => {
    it('优先推荐尚未跨题验证的知识单元', () => {
        const advice = buildGrowthAdvice([
            { id: 'stable', name: '已稳定的规则', verificationStage: 'stable', attempts: 4, contexts: 2, questions: [{ id: 'q1' }] },
            { id: 'pending', name: '待验证的规则', verificationStage: 'pending', attempts: 0, contexts: 0, questions: [{ id: 'q2' }] },
        ], 2);

        expect(advice.priorityUnit?.id).toBe('pending');
        expect(advice.nextHref).toBe('/practice?id=q2');
        expect(advice.reviewCount).toBe(2);
    });

    it('没有知识单元时提示先留下带错答的错题', () => {
        const advice = buildGrowthAdvice([], 0);
        expect(advice.priorityUnit).toBeNull();
        expect(advice.dataStatus).toBe('empty');
        expect(advice.nextHref).toBe('/entry');
    });
});
