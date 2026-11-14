import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { test, expect } from '@playwright/test';

const database = new PrismaClient();
const userId = `gap-e2e-${randomUUID()}`;
const email = `${userId}@test.local`;
const password = randomUUID();
let itemId: string;

test.beforeAll(async () => {
    await database.user.create({ data: { id: userId, email, password: await hash(password, 10), name: '知识漏洞测试' } });
    const notebook = await database.subject.create({ data: { userId, name: '临时诊断测试', stage: 'junior_high', subjectKey: 'math' } });
    const item = await database.errorItem.create({ data: {
        userId, subjectId: notebook.id, originalImageUrl: '', questionText: '解方程 x + 2 = 5。',
        wrongAnswerText: 'x = 7', answerText: 'x = 3', analysis: '等式两边同时减 2。',
    } });
    itemId = item.id;
});
test.afterAll(async () => { await database.user.deleteMany({ where: { id: userId } }); await database.$disconnect(); });

test('手工诊断、确认、复核、小练和跨题页可用，手机无横向溢出', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/login');
    await page.getByLabel(/邮箱|Email/).fill(email);
    await page.getByLabel(/^密码$|^Password$/).fill(password);
    await page.getByRole('button', { name: /登录|Login/ }).click();
    await page.waitForURL('**/');
    await page.goto(`/error-items/${itemId}`);
    const panel = page.locator('#knowledge-gaps');
    await expect(panel.getByText('还没有诊断。', { exact: false })).toBeVisible();
    await panel.getByRole('button', { name: '手工添加诊断' }).click();
    const form = panel.locator('form');
    const fields = {
        '知识单元名称': '移项与等式两边同减', '触发规则：看到什么，想到什么': '看到等式一侧有加数，想到两侧同减',
        '适用条件与边界': '等式两边执行相同运算', '表层错因': '符号错误', '首个卡住步骤': '移项时仍然相加',
        '未使用的条件': '等号两边应同减', '候选解释': '可能未理解等价变形', '原文证据（连续摘录）': 'x = 7',
        '向学生追问': '等式两边要同时减去哪个数？', '卡点小练题目': 'x + 3 = 8，两边应做什么运算？',
        '参考答案': '同时减 3', '小步解析': '保持等式两边相等',
    };
    for (const [label, value] of Object.entries(fields)) await form.getByLabel(label, { exact: true }).fill(value);
    await form.getByRole('button', { name: '保存候选' }).click();
    await expect(panel.locator('article')).toContainText('待确认');
    await panel.getByRole('button', { name: '符合，确认这个漏洞', exact: true }).click();
    await panel.getByRole('button', { name: '我已复核练习、答案和学段边界' }).click();
    await panel.getByLabel('写下你的判断或推理').fill('两边同时减去 3');
    await panel.getByRole('button', { name: '查看参考答案' }).click();
    await panel.getByRole('button', { name: '独立完成', exact: true }).click();
    await expect(panel).toContainText('已记录');
    await page.reload();
    await expect(panel).toContainText('两边同时减去 3');
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.getByText('已确认', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/cuoyin-gap-mobile.png', fullPage: true });
    await page.goto('/knowledge-units');
    await expect(page.getByText('移项与等式两边同减', { exact: true })).toBeVisible();
    await expect(page.getByText('有效小练次数：1', { exact: false })).toBeVisible();
    await expect(page.getByText('待巩固', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: '/tmp/cuoyin-units-desktop.png', fullPage: true });
});
