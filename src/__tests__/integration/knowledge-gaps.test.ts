// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gapFixture } from '../fixtures/knowledge-gap';

const mocks = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined, currentUser: 'u1' as string | null, diagnose: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.db; } }));
vi.mock('@/lib/current-user', () => ({ getCurrentUser: () => mocks.currentUser ? mocks.db!.user.findUnique({ where: { id: mocks.currentUser } }) : null }));
vi.mock('@/lib/ai', () => ({ getAIService: () => ({ diagnoseKnowledgeGaps: mocks.diagnose }) }));
vi.mock('@/lib/ai-quota', () => ({ consumeAiQuota: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
import { GET, POST } from '@/app/api/error-items/[id]/knowledge-gaps/route';
import { GET as UNITS } from '@/app/api/knowledge-units/route';

let database: PrismaClient;
let directory: string;
const context = (id = 'q1') => ({ params: Promise.resolve({ id }) });
const post = (body: object, id = 'q1') => POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }), context(id));
async function createManual(id = 'q1') {
    expect((await post({ action: 'manual', candidate: gapFixture }, id)).status).toBe(200);
    return database.gapDiagnosis.findFirstOrThrow({ where: { errorItemId: id } });
}
beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'cuoyin-gaps-test-'));
    const file = join(directory, 'test.db'); writeFileSync(file, '');
    const url = `file:${file}`;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    database = new PrismaClient({ datasources: { db: { url } } }); mocks.db = database;
}, 120000);
beforeEach(async () => {
    await database.user.deleteMany(); mocks.currentUser = 'u1'; mocks.diagnose.mockReset();
    for (const id of ['u1', 'u2']) await database.user.create({ data: { id, email: `${id}@test.local`, password: 'test', isActive: true } });
    await database.subject.create({ data: { id: 'math', userId: 'u1', name: '数学', stage: 'junior_high', subjectKey: 'math' } });
    for (const id of ['q1', 'q2']) await database.errorItem.create({ data: { id, userId: 'u1', subjectId: 'math', originalImageUrl: '', questionText: `${id}: x + 2 = 5`, wrongAnswerText: 'x = 7' } });
});
afterAll(async () => { await database?.$disconnect(); if (directory) rmSync(directory, { recursive: true, force: true }); });

describe('知识漏洞闭环（真实 SQLite）', () => {
    it('不同学段的同名单元隔离，移动错题后旧诊断过期', async () => {
        await createManual();
        await database.subject.create({ data: { id: 'senior', userId: 'u1', name: '高中数学', stage: 'senior_high', subjectKey: 'math' } });
        await database.errorItem.update({ where: { id: 'q2' }, data: { subjectId: 'senior' } });
        await createManual('q2');
        expect(await database.knowledgeUnit.count()).toBe(2);
        await database.errorItem.update({ where: { id: 'q1' }, data: { subjectId: 'senior' } });
        expect((await (await GET(new Request('http://localhost'), context())).json()).diagnoses[0].stale).toBe(true);
    });
    it('合法 AI 候选持久化时不自动确认和复核', async () => {
        mocks.diagnose.mockResolvedValue({ status: 'candidate_diagnosis', diagnoses: [gapFixture] });
        expect((await post({ action: 'generate', reviewedInput: true })).status).toBe(200);
        expect(await database.gapDiagnosis.findFirstOrThrow()).toMatchObject({ source: 'ai', status: 'candidate', practiceReviewed: false });
    });
    it('未登录和其他用户不能读取或写入诊断', async () => {
        mocks.currentUser = null;
        expect((await GET(new Request('http://localhost'), context())).status).toBe(401);
        mocks.currentUser = 'u2';
        expect((await post({ action: 'manual', candidate: gapFixture })).status).toBe(404);
        expect((await GET(new Request('http://localhost'), context())).status).toBe(404);
        expect(await (await UNITS()).json()).toEqual({ units: [] });
    });
    it('证据不足时不调用 AI；伪造证据导致整个批次回滚', async () => {
        await database.errorItem.update({ where: { id: 'q1' }, data: { wrongAnswerText: '' } });
        expect(await (await post({ action: 'generate', reviewedInput: true })).json()).toMatchObject({ status: 'needs_more_information' });
        expect(mocks.diagnose).not.toHaveBeenCalled();
        await database.errorItem.update({ where: { id: 'q1' }, data: { wrongAnswerText: 'x = 7' } });
        mocks.diagnose.mockResolvedValue({ status: 'candidate_diagnosis', diagnoses: [gapFixture, { ...gapFixture, evidenceQuote: '伪造证据' }] });
        expect((await post({ action: 'generate', reviewedInput: true })).status).toBe(400);
        expect(await database.gapDiagnosis.count()).toBe(0);
        expect(await database.knowledgeUnit.count()).toBe(0);
    });
    it('确认与人工复核不可绕过；重复请求只计一次；跨题共享单元', async () => {
        for (const id of ['q1', 'q2']) {
            const d = await createManual(id);
            const practice = { action: 'practice', diagnosisId: d.id, requestId: randomUUID(), practiceIndex: 0, answer: '两边同减', result: 'correct' };
            expect((await post(practice, id)).status).toBe(400);
            expect((await post({ action: 'status', diagnosisId: d.id, status: 'confirmed' }, id)).status).toBe(200);
            expect((await post(practice, id)).status).toBe(400);
            expect((await post({ action: 'approve_practice', diagnosisId: d.id }, id)).status).toBe(200);
            expect((await post(practice, id)).status).toBe(200);
            expect((await post(practice, id)).status).toBe(200);
        }
        expect(await database.knowledgeUnit.count()).toBe(1);
        expect(await database.unitPracticeEvent.count()).toBe(2);
        const { units } = await (await UNITS()).json();
        expect(units[0]).toMatchObject({ attempts: 2, contexts: 2, verificationStage: 'cross_context', mastered: false });
        await database.errorItem.update({ where: { id: 'q1' }, data: { questionText: '改后的题目' } });
        const response = await GET(new Request('http://localhost'), context());
        expect((await response.json()).diagnoses[0].stale).toBe(true);
        expect((await (await UNITS()).json()).units[0]).toMatchObject({ attempts: 1, mastered: false });
    });
    it('学生可标不确定或拒绝；取消确认后练习停止计分', async () => {
        const d = await createManual();
        for (const status of ['uncertain', 'rejected', 'confirmed']) expect((await post({ action: 'status', diagnosisId: d.id, status })).status).toBe(200);
        await post({ action: 'approve_practice', diagnosisId: d.id });
        await post({ action: 'practice', diagnosisId: d.id, requestId: randomUUID(), practiceIndex: 0, answer: '同减', result: 'correct' });
        await post({ action: 'status', diagnosisId: d.id, status: 'uncertain' });
        expect((await (await UNITS()).json()).units[0].attempts).toBe(0);
        expect(await database.unitPracticeEvent.count()).toBe(1);
    });
});
