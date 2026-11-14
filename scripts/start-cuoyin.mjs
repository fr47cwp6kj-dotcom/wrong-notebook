import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const baseUrl = 'http://localhost:3333';
const prepareOnly = process.argv.includes('--prepare');
function run(script, args = []) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env: process.env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`初始化失败：${script}`);
}
function openBrowser() {
    const command = process.platform === 'darwin' ? ['open', [baseUrl]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', baseUrl]] : ['xdg-open', [baseUrl]];
    spawn(command[0], command[1], { stdio: 'ignore' }).on('error', () => console.info(`请在浏览器打开 ${baseUrl}`));
}

try {
    if (!existsSync('node_modules/next')) throw new Error('请先在项目目录执行 npm ci --registry=https://registry.npmjs.org');
    if (!prepareOnly) {
        try {
            const response = await fetch(`${baseUrl}/api/cuoyin-status`, { signal: AbortSignal.timeout(1500) });
            if (response.ok && (await response.json()).app === 'cuoyin-agent-fork') { openBrowser(); process.exit(0); }
        } catch { /* 本地服务尚未启动，继续初始化。 */ }
    }
    mkdirSync('data', { recursive: true });
    if (!existsSync('.env')) writeFileSync('.env', `DATABASE_URL="file:../data/cuoyin-fork.db"\nNEXTAUTH_URL="${baseUrl}"\nNEXTAUTH_SECRET="${randomBytes(48).toString('hex')}"\nLOG_LEVEL="info"\n`, { mode: 0o600 });
    const { config } = await import('dotenv'); config({ quiet: true });
    // 先建立空文件，兼容当前 macOS 上的 Prisma SQLite 创建行为。
    const url = process.env.DATABASE_URL;
    if (!url?.startsWith('file:')) throw new Error('本地试用版需要 SQLite 数据库。');
    const dbPath = path.resolve(root, 'prisma', url.slice(5));
    mkdirSync(path.dirname(dbPath), { recursive: true });
    if (!existsSync(dbPath)) closeSync(openSync(dbPath, 'wx', 0o600));
    run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
    const { PrismaClient } = await import('@prisma/client');
    const { hash } = await import('bcryptjs');
    const db = new PrismaClient();
    try {
        if (await db.user.count() === 0) {
            await db.user.create({ data: { email: 'admin@localhost', password: await hash('123456', 12), name: '家长', role: 'admin', educationStage: 'junior_high', enrollmentYear: 2026, confirmBeforeImport: true } });
            console.info('首次账号：admin@localhost，密码：123456。登录后按向导修改密码。');
        }
        if (await db.knowledgeTag.count({ where: { isSystem: true } }) === 0) run('node_modules/ts-node/dist/bin.js', ['--compiler-options', '{"module":"CommonJS"}', 'scripts/rebuild-system-tags.ts']);
    } finally { await db.$disconnect(); }
    if (!prepareOnly) {
        console.info(`错因 Agent 已准备，正在打开 ${baseUrl}；使用期间请保留本窗口。`);
        const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3333'], { cwd: root, env: process.env, stdio: 'inherit' });
        const timer = setInterval(async () => {
            try {
                const response = await fetch(`${baseUrl}/api/cuoyin-status`, { signal: AbortSignal.timeout(1500) });
                if (response.ok) { clearInterval(timer); openBrowser(); }
            } catch { /* 编译完成后再打开浏览器。 */ }
        }, 2000);
        child.on('exit', code => { clearInterval(timer); process.exit(code ?? 1); });
        process.on('SIGINT', () => child.kill('SIGINT'));
        process.on('SIGTERM', () => child.kill('SIGTERM'));
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
