import { describe, expect, it } from 'vitest';
import { computeRuleMastery, confirmMasteryLevel } from '@/lib/mastery';
import { masteryStatusOf } from '@/lib/mastery-status';
import type { PracticeResult } from '@/lib/ai/types';

type Entry = { result: PracticeResult; difficulty: string | null; source: string; hintUsed?: boolean; createdAt?: string; questionText?: string | null };

const correct = (over: Partial<Entry> = {}): Entry => ({ result: 'correct', difficulty: 'easy', source: 'practice', questionText: '变式题甲', createdAt: '2026-11-01T10:00:00Z', ...over });

describe('confirmMasteryLevel 掌握确认规则', () => {
    it('单次做对简单变式题不能确认已掌握', () => {
        const { level, missing } = confirmMasteryLevel(0.67, [correct()]);
        expect(level).toBe(1);
        expect(missing).toContain('cross_context_correct');
        expect(missing).toContain('review_verification');
    });

    it('同一情境连续答对仍缺跨题确认', () => {
        // 同一天同一来源的两次答对 = 一个情境
        const sameDay = [correct(), correct({ createdAt: '2026-11-01T12:00:00Z' })];
        const { level, missing } = confirmMasteryLevel(0.8, sameDay, []);
        expect(level).toBe(1);
        expect(missing).toContain('cross_context_correct');
    });

    it('两个不同情境独立答对但未经过复习验证时保持复习中', () => {
        const history = [
            correct({ createdAt: '2026-11-01T10:00:00Z' }),
            correct({ createdAt: '2026-11-05T10:00:00Z', questionText: '变式题乙' }),
        ];
        const { level, missing } = confirmMasteryLevel(0.9, history, []);
        expect(level).toBe(1);
        expect(missing).toEqual(['review_verification']);
    });

    it('已完成的复习之后再次独立答对方可确认已掌握', () => {
        const history = [
            correct({ createdAt: '2026-11-01T10:00:00Z' }),
            correct({ createdAt: '2026-11-05T10:00:00Z', questionText: '变式题乙' }),
            correct({ createdAt: '2026-11-20T10:00:00Z', questionText: '变式题丙' }),
        ];
        const { level, missing } = confirmMasteryLevel(0.9, history, ['2026-11-12T08:00:00Z']);
        expect(level).toBe(2);
        expect(missing).toEqual([]);
    });

    it('复习验证之前的答对不能代替验证之后的答对', () => {
        const history = [
            correct({ createdAt: '2026-11-01T10:00:00Z' }),
            correct({ createdAt: '2026-11-05T10:00:00Z' }),
        ];
        const { level } = confirmMasteryLevel(0.9, history, ['2026-11-12T08:00:00Z']);
        expect(level).toBe(1);
    });

    it('用提示后答对不算独立通过', () => {
        const history = [
            correct({ createdAt: '2026-11-01T10:00:00Z', hintUsed: true }),
            correct({ createdAt: '2026-11-05T10:00:00Z', hintUsed: true }),
            correct({ createdAt: '2026-11-20T10:00:00Z' }),
        ];
        const { level, missing } = confirmMasteryLevel(0.9, history, ['2026-11-12T08:00:00Z']);
        expect(level).toBe(1);
        expect(missing).toContain('cross_context_correct');
    });

    it('同一题隔天答对或换来源作答仍不算跨题', () => {
        const history = [correct(), correct({ createdAt: '2026-11-20T10:00:00Z', source: 'exam' })];
        expect(confirmMasteryLevel(0.9, history, ['2026-11-12T08:00:00Z']).missing).toContain('cross_context_correct');
    });

    it('旧记录缺题目内容时不凭日期推定跨题', () => {
        const history = [correct({ questionText: null }), correct({ questionText: null, createdAt: '2026-11-20T10:00:00Z' })];
        expect(confirmMasteryLevel(0.9, history, ['2026-11-12T08:00:00Z']).missing).toContain('cross_context_correct');
    });

    it('概率不达标时直接保持复习中', () => {
        const { level } = confirmMasteryLevel(0.4, [correct(), correct({ createdAt: '2026-11-05T10:00:00Z' })], ['2026-11-12T08:00:00Z']);
        expect(level).toBe(1);
    });
});

describe('computeRuleMastery 提示折算', () => {
    it('用提示后答对的得分低于独立答对', () => {
        const independent = computeRuleMastery([correct()])!;
        const hinted = computeRuleMastery([correct({ hintUsed: true })])!;
        expect(hinted).toBeLessThan(independent);
    });
});

describe('masteryStatusOf 以评估结果为权威', () => {
    it('概率达标但评估等级未确认时仍显示复习中', () => {
        expect(masteryStatusOf(2, 0.9, 1)).toBe('reviewing');
    });

    it('评估等级确认已掌握时显示已掌握', () => {
        expect(masteryStatusOf(3, 0.9, 2)).toBe('mastered');
    });

    it('调用方未提供等级时按概率回退（等级字段总有默认值，正常链路不会走到）', () => {
        expect(masteryStatusOf(1, 0.5)).toBe('mastered');
        expect(masteryStatusOf(1, null, null)).toBe('reviewing');
    });
});
