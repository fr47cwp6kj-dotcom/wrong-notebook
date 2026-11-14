/**
 * 知识点重新生成 API 集成测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: { findUnique: vi.fn() },
    errorItem: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    knowledgeTag: { findMany: vi.fn(), upsert: vi.fn() },
    subject: { findUnique: vi.fn() },
    suggestKnowledgeTags: vi.fn(),
    getCurrentMathCurriculumTags: vi.fn(),
    getNotebookCandidateTags: vi.fn(),
    session: { user: { email: 'user@example.com' }, expires: '2099-01-01' },
}));

vi.mock('@/lib/prisma', () => ({
    prisma: { user: mocks.user, errorItem: mocks.errorItem, knowledgeTag: mocks.knowledgeTag, subject: mocks.subject },
}));
vi.mock('@/lib/ai', () => ({ getAIService: vi.fn(() => ({ suggestKnowledgeTags: mocks.suggestKnowledgeTags })) }));
vi.mock('@/lib/ai/tag-service', () => ({ getCurrentMathCurriculumTags: mocks.getCurrentMathCurriculumTags, getNotebookCandidateTags: mocks.getNotebookCandidateTags }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(() => Promise.resolve(mocks.session)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { POST as RETAG_ITEM } from '@/app/api/error-items/[id]/retag/route';
import { GET as JOB_STATUS, POST as START_JOB } from '@/app/api/notebooks/[id]/retag/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const item = {
    userId: 'user-1',
    questionText: '已知 AB = AC，BD = CD，求证 △ABD ≌ △ACD',
    answerText: '△ABD ≌ △ACD',
    analysis: '三组对应边相等（SSS）',
    wrongAnswerText: '仅由两条边相等判断全等',
    mistakeAnalysis: '缺少第三组对应边相等',
    gradeSemester: '四年级上',
    subject: { name: '数学', stage: 'primary', subjectKey: 'math' },
    tags: [
        { id: 'old-sys', name: '100以内加法', isSystem: true },
        { id: 'custom-1', name: '易错', isSystem: false },
    ],
    user: { educationStage: 'primary', enrollmentYear: 2023 },
};

describe('知识点重新生成', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.findUnique.mockResolvedValue({ id: 'user-1' });
        mocks.getNotebookCandidateTags.mockResolvedValue({ subjectName: '数学', gradeSemester: '初二上', tags: ['全等三角形', '三角形全等的判定', '轴对称最短路径'] });
        mocks.getCurrentMathCurriculumTags.mockResolvedValue(['全等三角形', '三角形全等的判定', '轴对称最短路径']);
    });

    it('preview 模式只返回建议的知识点（含保留的自定义标签），不写数据库', async () => {
        mocks.errorItem.findUnique.mockResolvedValue(item);
        mocks.suggestKnowledgeTags.mockResolvedValue({ tags: ['全等三角形'], difficultyStars: 3 });
        mocks.knowledgeTag.findMany.mockResolvedValue([{ id: 'tag-b', name: '全等三角形' }]);

        const response = await RETAG_ITEM(new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ preview: true }),
        }), params('e1'));

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ tags: ['全等三角形', '易错'], difficultyStars: 3 });
        expect(mocks.errorItem.update).not.toHaveBeenCalled();
    });

    it('preview 模式同样不能读取其他用户的题目', async () => {
        mocks.errorItem.findUnique.mockResolvedValue({ ...item, userId: 'other-user' });

        const response = await RETAG_ITEM(new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ preview: true }),
        }), params('e1'));

        expect(response.status).toBe(404);
        expect(mocks.suggestKnowledgeTags).not.toHaveBeenCalled();
    });

    it('教材新增标签在预览时不写库，保存时补齐关联；忽略 AI 超范围返回', async () => {
        mocks.errorItem.findUnique.mockResolvedValue(item);
        mocks.suggestKnowledgeTags.mockResolvedValue({ tags: ['轴对称最短路径', '最值问题'], difficultyStars: null });
        mocks.knowledgeTag.findMany.mockResolvedValue([]);
        mocks.knowledgeTag.upsert.mockResolvedValue({ id: 'new-path-tag' });
        const preview = await RETAG_ITEM(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ preview: true }) }), params('e1'));
        expect(await preview.json()).toMatchObject({ tags: ['轴对称最短路径', '易错'] });
        expect(mocks.knowledgeTag.upsert).not.toHaveBeenCalled();

        const saved = await RETAG_ITEM(new Request('http://localhost', { method: 'POST' }), params('e1'));
        expect(saved.status).toBe(200);
        expect(mocks.errorItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
            knowledgePoints: JSON.stringify(['轴对称最短路径', '易错']),
            questionKnowledgePoints: null,
            tags: { disconnect: [{ id: 'old-sys' }], connect: [{ id: 'new-path-tag' }] },
        }) }));
    });

    it('替换系统标签并保留自定义标签，数学旧错题本也采用指定教材范围', async () => {
        mocks.errorItem.findUnique.mockResolvedValue(item);
        mocks.suggestKnowledgeTags.mockResolvedValue({ tags: ['三角形全等的判定', '全等三角形'], difficultyStars: 2 });
        mocks.knowledgeTag.findMany.mockResolvedValue([
            { id: 'tag-a', name: '三角形全等的判定' },
            { id: 'tag-b', name: '全等三角形' },
            { id: 'tag-b-dup', name: '全等三角形' },
        ]);

        const response = await RETAG_ITEM(new Request('http://localhost', { method: 'POST' }), params('e1'));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.tags).toEqual(['三角形全等的判定', '全等三角形', '易错']);
        expect(mocks.getNotebookCandidateTags).toHaveBeenCalledWith({ subject: 'math', stage: 'primary' });
        expect(mocks.getCurrentMathCurriculumTags).not.toHaveBeenCalled();
        expect(mocks.suggestKnowledgeTags.mock.calls[0][0]).toMatchObject({
            subject: '数学',
            gradeSemester: '初二上',
            questionText: '已知 AB = AC，BD = CD，求证 △ABD ≌ △ACD',
            answerText: '△ABD ≌ △ACD',
            analysis: '三组对应边相等（SSS）',
            wrongAnswerText: '仅由两条边相等判断全等',
            mistakeAnalysis: '缺少第三组对应边相等',
        });
        expect(mocks.errorItem.update).toHaveBeenCalledWith({
            where: { id: 'e1' },
            data: {
                knowledgePoints: JSON.stringify(['三角形全等的判定', '全等三角形', '易错']),
                questionKnowledgePoints: null,
                difficultyStars: 2,
                paperLevel: 'a',
                tags: { disconnect: [{ id: 'old-sys' }], connect: [{ id: 'tag-a' }, { id: 'tag-b' }] },
            },
        });
    });

    it('高中物理错题本取高中物理的全部知识点', async () => {
        mocks.errorItem.findUnique.mockResolvedValue({ ...item, subject: { name: '物理错题', stage: 'senior_high', subjectKey: 'physics' } });
        mocks.getNotebookCandidateTags.mockResolvedValue({ subjectName: '物理', tags: ['牛顿第二定律'] });
        mocks.suggestKnowledgeTags.mockResolvedValue({ tags: ['牛顿第二定律'], difficultyStars: 3 });
        mocks.knowledgeTag.findMany.mockResolvedValue([{ id: 'tag-n', name: '牛顿第二定律' }]);

        const response = await RETAG_ITEM(new Request('http://localhost', { method: 'POST' }), params('e1'));

        expect(response.status).toBe(200);
        expect(mocks.getNotebookCandidateTags).toHaveBeenCalledWith({ subject: 'physics', stage: 'senior_high' });
        expect(mocks.suggestKnowledgeTags.mock.calls[0][0]).toMatchObject({ subject: '物理', allowedTags: ['牛顿第二定律'] });
    });

    it('不在错题本中的题目使用当前数学教材范围', async () => {
        mocks.errorItem.findUnique.mockResolvedValue({ ...item, subject: null });
        mocks.suggestKnowledgeTags.mockResolvedValue({ tags: ['全等三角形'], difficultyStars: 2 });
        mocks.knowledgeTag.findMany.mockResolvedValue([{ id: 'tag-b', name: '全等三角形' }]);

        await RETAG_ITEM(new Request('http://localhost', { method: 'POST' }), params('e1'));

        expect(mocks.getCurrentMathCurriculumTags).toHaveBeenCalledWith();
        expect(mocks.getNotebookCandidateTags).not.toHaveBeenCalled();
    });

    it('AI 未给出难度星级时保留原星级', async () => {
        mocks.errorItem.findUnique.mockResolvedValue(item);
        mocks.suggestKnowledgeTags.mockResolvedValue({ tags: ['全等三角形'], difficultyStars: null });
        mocks.knowledgeTag.findMany.mockResolvedValue([{ id: 'tag-b', name: '全等三角形' }]);

        const response = await RETAG_ITEM(new Request('http://localhost', { method: 'POST' }), params('e1'));

        expect(response.status).toBe(200);
        expect(mocks.errorItem.update.mock.calls[0][0].data).not.toHaveProperty('difficultyStars');
        expect(mocks.errorItem.update.mock.calls[0][0].data).not.toHaveProperty('paperLevel');
    });

    it.each([null, 'a', 'other'])('补评为 5 星时只为未设置卷别的题目补默认值（原卷别 %s）', async (paperLevel) => {
        mocks.errorItem.findUnique.mockResolvedValue({ ...item, paperLevel });
        mocks.suggestKnowledgeTags.mockResolvedValue({ tags: ['全等三角形'], difficultyStars: 5 });
        mocks.knowledgeTag.findMany.mockResolvedValue([{ id: 'tag-b', name: '全等三角形' }]);
        expect((await RETAG_ITEM(new Request('http://localhost', { method: 'POST' }), params('e1'))).status).toBe(200);
        const data = mocks.errorItem.update.mock.calls[0][0].data;
        if (paperLevel === null) expect(data.paperLevel).toBe('b');
        else expect(data).not.toHaveProperty('paperLevel');
    });

    it('他人的题目返回 404，AI 未选出知识点时返回 400 且不修改', async () => {
        mocks.errorItem.findUnique.mockResolvedValueOnce({ ...item, userId: 'other' });
        const foreign = await RETAG_ITEM(new Request('http://localhost', { method: 'POST' }), params('e1'));
        expect(foreign.status).toBe(404);

        mocks.errorItem.findUnique.mockResolvedValueOnce(item);
        mocks.suggestKnowledgeTags.mockResolvedValueOnce({ tags: [], difficultyStars: null });
        const empty = await RETAG_ITEM(new Request('http://localhost', { method: 'POST' }), params('e1'));
        expect(empty.status).toBe(400);
        expect((await empty.json()).message).toBe('NO_TAGS_SELECTED');
        expect(mocks.errorItem.update).not.toHaveBeenCalled();
    });

    it('AI 错误码透传给前端', async () => {
        mocks.errorItem.findUnique.mockResolvedValue(item);
        mocks.suggestKnowledgeTags.mockRejectedValue(new Error('AI_AUTH_ERROR: invalid key'));

        const response = await RETAG_ITEM(new Request('http://localhost', { method: 'POST' }), params('e1'));

        expect(response.status).toBe(500);
        expect((await response.json()).message).toBe('AI_AUTH_ERROR');
    });

    it('批量任务在后台逐题处理并汇报进度', async () => {
        mocks.subject.findUnique.mockResolvedValue({ userId: 'user-1' });
        mocks.errorItem.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
        mocks.errorItem.findUnique
            .mockResolvedValueOnce(item)
            .mockResolvedValueOnce({ ...item, questionText: '' });
        mocks.suggestKnowledgeTags.mockResolvedValue({ tags: ['全等三角形'], difficultyStars: 3 });
        mocks.knowledgeTag.findMany.mockResolvedValue([{ id: 'tag-b', name: '全等三角形' }]);

        const started = await START_JOB(new Request('http://localhost', { method: 'POST' }), params('nb-1'));
        expect(started.status).toBe(202);
        expect(await started.json()).toMatchObject({ total: 2, running: true });

        await vi.waitFor(async () => {
            const status = await (await JOB_STATUS(new Request('http://localhost'), params('nb-1'))).json();
            expect(status).toMatchObject({ total: 2, done: 2, failed: 1, running: false });
        });
        expect(mocks.errorItem.findMany.mock.calls[0][0].where).toEqual({ userId: 'user-1', subjectId: 'nb-1' });
    });

    it('不能对他人的错题本发起任务', async () => {
        mocks.subject.findUnique.mockResolvedValue({ userId: 'other' });

        const response = await START_JOB(new Request('http://localhost', { method: 'POST' }), params('nb-x'));

        expect(response.status).toBe(404);
        expect(mocks.errorItem.findMany).not.toHaveBeenCalled();
    });
});
