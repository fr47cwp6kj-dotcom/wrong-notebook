import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'build', 'remote-next');
const standalone = path.join(output, 'standalone');
const localUrl = 'http://127.0.0.1:3334';

/** 正式版继续使用原数据库和配置，不因 standalone 工作目录改变而建新库。 */
export function runtimeEnv(projectRoot, source, local = false) {
    let publicUrl;
    try { publicUrl = new URL(local ? 'http://localhost:3334' : source.CUOYIN_PUBLIC_URL); }
    catch { throw new Error('请先在 .env 填写 CUOYIN_PUBLIC_URL，值为你的固定 HTTPS 网址。'); }
    if ((!local && publicUrl.protocol !== 'https:') || publicUrl.username || publicUrl.password ||
        publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
        throw new Error('固定网址必须是 HTTPS 地址，不能带路径、账号或参数。');
    }
    if (!source.DATABASE_URL?.startsWith('file:')) throw new Error('正式版需要现有的 SQLite 数据库配置。');
    if (!source.NEXTAUTH_SECRET || source.NEXTAUTH_SECRET.length < 32 || source.NEXTAUTH_SECRET === 'supersecret-dev-secret') {
        throw new Error('请先配置至少 32 位的随机会话密钥 NEXTAUTH_SECRET。');
    }
    return {
        ...source,
        NODE_ENV: 'production',
        CUOYIN_REMOTE_BUILD: '1',
        NEXT_TELEMETRY_DISABLED: '1',
        DATABASE_URL: `file:${path.resolve(projectRoot, 'prisma', source.DATABASE_URL.slice(5))}`,
        CONFIG_DIR: path.resolve(projectRoot, source.CONFIG_DIR || 'config'),
        NEXTAUTH_URL: publicUrl.origin,
        NEXTAUTH_URL_INTERNAL: localUrl,
        HOSTNAME: '127.0.0.1',
        PORT: '3334',
        PRESERVE_EXISTING_DATA: 'true',
        LOG_LEVEL: 'info',
        DEBUG_DB: 'false',
    };
}

export async function checkAccounts(users, compare, config, env) {
    if (config.allowRegistration ?? env.ALLOW_REGISTRATION === 'true') {
        throw new Error('请先在设置的用户管理中关闭公开注册，再启动外网正式版。');
    }
    if (users.length === 0) throw new Error('请先在本地版创建账号并完成设置。');
    for (const user of users) {
        if (await compare('123456', user.password)) throw new Error('有账号仍使用初始密码，请先在本地版修改密码。');
    }
}

function run(script, args, env) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`执行失败：${path.basename(script)}`);
}

function prepare(env) {
    run('node_modules/next/dist/bin/next', ['build'], env);
    if (!existsSync(path.join(standalone, 'server.js'))) throw new Error('未生成正式版启动文件。');
    // 构建可能追踪本机配置；运行时始终读原目录，清除副本以免过期或误分享。
    for (const name of readdirSync(standalone)) {
        if (name.startsWith('.env') || ['config', 'data', 'prisma'].includes(name) || /\.(db|sqlite)(-journal)?$/.test(name)) {
            rmSync(path.join(standalone, name), { recursive: true, force: true });
        }
    }
    cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
    cpSync(path.join(output, 'static'), path.join(standalone, 'build', 'remote-next', 'static'), { recursive: true });
    console.info('正式版已准备好。穿透服务的本地目标地址是 http://127.0.0.1:3334。');
}

export async function main() {
    process.chdir(root);
    const { config } = await import('dotenv');
    config({ quiet: true });
    const prepareOnly = process.argv.includes('--prepare');
    const local = process.argv.includes('--local');
    // 尚未绑定域名时也能先构建，但普通启动必须提供真实的 HTTPS 网址。
    const env = runtimeEnv(root, process.env, prepareOnly || local);
    if (!existsSync(env.DATABASE_URL.slice(5))) throw new Error('找不到原数据库，请先启动本地版。');
    const configFile = path.join(env.CONFIG_DIR, 'app-config.json');
    const savedConfig = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
    const { PrismaClient } = await import('@prisma/client');
    const { compare } = await import('bcryptjs');
    const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    try {
        const users = await db.user.findMany({ where: { isActive: true }, select: { password: true } });
        await checkAccounts(users, compare, savedConfig, env);
    } finally { await db.$disconnect(); }
    run('node_modules/prisma/build/index.js', ['migrate', 'deploy'], env);
    if (prepareOnly || !existsSync(path.join(standalone, 'server.js'))) prepare(env);
    if (prepareOnly) return;

    console.info(`正在启动正式版，访问网址：${env.NEXTAUTH_URL}`);
    console.info('使用期间请保持电脑开机联网，并保留本窗口；按 Ctrl+C 停止。');
    const child = spawn(process.execPath, [path.join(standalone, 'server.js')], { cwd: root, env, stdio: 'inherit' });
    let stopping = false;
    const stop = () => { stopping = true; child.kill('SIGTERM'); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    const exitCode = await new Promise((resolve, reject) => {
        child.once('error', reject);
        // Next.js 收到 SIGTERM 会返回 143；用户主动关闭不应显示为启动失败。
        child.once('exit', code => resolve(stopping ? 0 : code ?? 1));
    });
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.exitCode = exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
