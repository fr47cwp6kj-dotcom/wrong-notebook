/**
 * 按错题本学段 + 学科获取候选知识点
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { knowledgeTag: { findMany } } }));
vi.mock('@/lib/logger', () => ({ createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import { getNotebookCandidateTags, getScopeTagsFromDB } from '@/lib/ai/tag-service';

// 年级 → 章节 → 知识点；小学两个年级、初中一个年级
const tree = [
    { id: 'g1', name: '一年级', parentId: null },
    { id: 'c1', name: '数一数', parentId: 'g1' },
    { id: 't1', name: '10以内数的认识', parentId: 'c1' },
    { id: 't2', name: '比大小', parentId: 'c1' },
    { id: 'g4', name: '四年级', parentId: null },
    { id: 'c4', name: '课外拓展（高思）', parentId: 'g4' },
    { id: 's4', name: '高思上册', parentId: 'c4' },
    { id: 't3', name: '鸡兔同笼', parentId: 's4' },
    { id: 't4', name: '比大小', parentId: 'c4' }, // 与一年级同名，去重
    { id: 'g7', name: '七年级上', parentId: null },
    { id: 'c7', name: '有理数', parentId: 'g7' },
    { id: 't7', name: '正数和负数', parentId: 'c7' },
    { id: 'g7b', name: '七年级下', parentId: null },
    { id: 'c7b', name: '整式', parentId: 'g7b' },
    { id: 't7b', name: '整式加减', parentId: 'c7b' },
    { id: 'g8a', name: '八年级上', parentId: null },
    { id: 'c8a', name: '图形的轴对称', parentId: 'g8a' },
    { id: 't8a', name: '轴对称图形', parentId: 'c8a' },
    { id: 't8min', name: '轴对称最短路径', parentId: 'c8a' },
    { id: 'g8b', name: '八年级下', parentId: null },
    { id: 'c8b', name: '一次函数', parentId: 'g8b' },
    { id: 't8b', name: '一次函数', parentId: 'c8b' },
    { id: 'g9a', name: '九年级上', parentId: null },
    { id: 'c9a', name: '二次函数', parentId: 'g9a' },
    { id: 't9a', name: '最值问题', parentId: 'c9a' },
];

describe('getScopeTagsFromDB', () => {
    beforeEach(() => {
        findMany.mockReset();
        findMany.mockImplementation(async (args?: { where?: { name?: { in?: string[] } } }) => {
            const names = args?.where?.name?.in;
            return names ? tree.filter((tag) => !tag.parentId && names.includes(tag.name)) : tree;
        });
    });

    it('返回该学段所有年级下的全部叶子知识点（不按学生年级裁剪），同名去重', async () => {
        expect(await getScopeTagsFromDB('math', 'primary')).toEqual(['10以内数的认识', '比大小', '鸡兔同笼']);
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { subject: 'math', isSystem: true } }));
    });

    it('其他学段的知识点不会混入', async () => {
        expect(await getScopeTagsFromDB('math', 'junior_high')).toEqual(['正数和负数', '整式加减', '轴对称图形', '轴对称最短路径', '一次函数', '最值问题']);
        expect(await getScopeTagsFromDB('math', 'senior_high')).toEqual([]);
    });

    it('数学错题本只向 AI 提供浙教版初二上及之前学过的标签', async () => {
        const candidates = await getNotebookCandidateTags({ stage: 'junior_high', subject: 'math' });
        expect(candidates).toMatchObject({
            subjectName: '数学',
            curriculumLabel: '浙教版初二上',
            gradeSemester: '初二上',
        });
        expect(candidates?.tags).toEqual(expect.arrayContaining(['轴对称最短路径', '一次函数', '勾股定理', '一元一次不等式']));
        expect(candidates?.tags).not.toContain('最值问题');
        expect(candidates?.tags).not.toContain('二次函数');
        expect(candidates?.tags).not.toContain('鸡兔同笼');
        expect(await getNotebookCandidateTags({ stage: 'primary', subject: 'math' })).toEqual(candidates);
    });

    it('学科未知时不提供候选知识点；否则带上中文学科名', async () => {
        expect(await getNotebookCandidateTags({ stage: 'primary', subject: null })).toBeUndefined();
        expect(await getNotebookCandidateTags({ stage: 'primary', subject: 'english' })).toMatchObject({ subjectName: '英语' });
    });

    it('数据库出错时返回空列表', async () => {
        findMany.mockRejectedValue(new Error('db down'));
        expect(await getScopeTagsFromDB('math', 'primary')).toEqual([]);
    });
});
