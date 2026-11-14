import { test, expect, type Page } from '@playwright/test';
import { ADMIN_PASSWORD } from './helpers';

async function login(page: Page) {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel(/邮箱|Email/).fill('admin@localhost');
    await page.getByLabel(/^密码$|^Password$/).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /登录|Login/ }).click();
    await page.waitForURL('**/', { timeout: 15000 });
}

/** 详情页中标题为 title 的卡片 */
function card(page: Page, title: string | RegExp) {
    return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: title }) });
}

test('从题干后的快捷入口生成动画，并在详情页开启交互式图形演示', async ({ page }) => {
    await login(page);
    let interactiveFigureEnabled = false;
    let interactiveFigureCommands: string | undefined;
    await page.route('**/api/user', async (route) => {
        if (route.request().method() === 'PATCH') {
            interactiveFigureEnabled = route.request().postDataJSON().enableGeogebra === true;
        }
        await route.fulfill({ json: { enableSvgAnimation: true, enableGeogebra: interactiveFigureEnabled } });
    });
    await page.route('**/api/error-items/visualization-test', (route) => route.fulfill({
        json: { id: 'visualization-test', questionText: '已知 AB = 3，求 AB 的中点。', answerText: 'M', analysis: '平分线段。', geogebraCommands: interactiveFigureCommands },
    }));
    await page.route('**/api/error-items/visualization-test/svg-animation', (route) => route.fulfill({
        json: { svgAnimation: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><circle r="5" cy="25"><animate attributeName="cx" from="10" to="90" dur="10s"/></circle></svg>' },
    }));
    await page.route('**/api/error-items/visualization-test/geogebra', (route) => {
        const commands = ['A = (0, 0)', 'B = (3, 0)', 'M = Midpoint(A, B)'];
        interactiveFigureCommands = JSON.stringify(commands);
        return route.fulfill({ json: { suitable: true, commands } });
    });
    await page.route('https://www.geogebra.org/apps/deployggb.js', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: `window.GGBApplet = class {
            constructor(options) { this.options = options; }
            inject() {
                this.options.appletOnLoad({ evalCommand() { return true; }, setSize() {}, resetConstruction() {} });
            }
        };`,
    }));

    await page.goto('/error-items/visualization-test');
    await page.getByRole('link', { name: 'SVG 动画讲解' }).click({ timeout: 5000 });
    await expect(page.getByText(/点击「生成动画讲解」/)).toBeInViewport();
    await page.getByRole('button', { name: '生成动画讲解', exact: true }).click();
    await expect(page.getByRole('slider', { name: '动画进度' })).toBeVisible();
    await expect(page.getByText(/拖动进度条查看任意步骤/)).toBeVisible();

    await page.getByRole('link', { name: '交互式图形演示' }).click();
    await page.getByRole('button', { name: '开启演示' }).click();
    await expect(page.getByRole('button', { name: '生成演示', exact: true })).toBeVisible();
    await expect(page.getByText(/拖动图中的可动点或滑块/)).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: '生成演示', exact: true }).click();
    await expect(page.getByRole('button', { name: '重置', exact: true })).toBeEnabled();
    await expect(page.getByText(/点击「重置」回到初始状态/)).toBeVisible();
});

test('错题详情页显示各区块，编辑后保存并在刷新后保留', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);

    // 通过接口准备错题本和错题，避免依赖 AI 识别。
    // 用物理学科：其他用例按「数学」查找错题本，名称匹配为子串匹配，不能出现「数学」字样
    const notebookRes = await page.request.post('/api/notebooks', {
        data: { name: `详情页测试-${Date.now()}`, stage: 'junior_high', subjectKey: 'physics' },
    });
    expect(notebookRes.ok()).toBeTruthy();
    const notebook = await notebookRes.json();
    const itemRes = await page.request.post('/api/error-items', {
        data: {
            subjectId: notebook.id,
            questionText: `匀速运动的物体 ${Date.now() % 1000} 秒内通过的路程`,
            answerText: 's = vt',
            analysis: '路程等于速度乘以时间。',
            knowledgePoints: ['匀速直线运动'],
        },
    });
    expect(itemRes.ok()).toBeTruthy();
    const item = await itemRes.json();

    await page.goto(`/error-items/${item.id}`);
    await expect(page.getByRole('heading', { name: '错题详情' })).toBeVisible({ timeout: 15000 });
    await expect(card(page, '题目')).toContainText('匀速运动的物体');
    await expect(card(page, '题目')).toContainText('匀速直线运动');
    await expect(card(page, '参考答案')).toContainText('s = vt');
    await expect(card(page, /^解析$/)).toContainText('路程等于速度乘以时间。');
    await expect(card(page, '你的笔记 / 答案')).toContainText('暂无笔记');

    // 编辑笔记并保存
    const notes = card(page, '你的笔记 / 答案');
    await notes.getByRole('button', { name: '编辑' }).click();
    await notes.locator('textarea').fill('注意单位换算');
    const savedNote = page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/error-items/${item.id}/notes`
        && response.request().method() === 'PATCH');
    await notes.getByRole('button', { name: '保存' }).click();
    expect((await savedNote).ok()).toBeTruthy();
    await expect(notes.locator('textarea')).toBeHidden();
    await expect(notes).toContainText('注意单位换算');

    // 取消编辑不保存修改
    const analysis = card(page, /^解析$/);
    await analysis.getByRole('button', { name: '编辑' }).click();
    await analysis.locator('textarea').fill('不应保存的内容');
    await analysis.getByRole('button', { name: '取消' }).click();
    await expect(analysis).toContainText('路程等于速度乘以时间。');

    // 刷新后笔记仍在
    await page.reload();
    await expect(card(page, '你的笔记 / 答案')).toContainText('注意单位换算', { timeout: 15000 });
    await expect(card(page, /^解析$/)).toContainText('路程等于速度乘以时间。');

    // 删除本用例创建的错题和错题本（错题本须为空才能删除），不影响其他用例
    expect((await page.request.delete(`/api/error-items/${item.id}/delete`)).ok()).toBeTruthy();
    expect((await page.request.delete(`/api/notebooks/${notebook.id}`)).ok()).toBeTruthy();
});
