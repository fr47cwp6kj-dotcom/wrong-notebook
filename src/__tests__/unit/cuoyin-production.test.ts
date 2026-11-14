// @vitest-environment node
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAccounts, runtimeEnv } from '../../../scripts/start-cuoyin-production.mjs';

const project = '/tmp/cuoyin-example';
const source = {
    DATABASE_URL: 'file:../data/cuoyin-fork.db',
    NEXTAUTH_SECRET: 'a'.repeat(48),
    NEXTAUTH_URL: 'http://localhost:3333',
    CUOYIN_PUBLIC_URL: 'https://notebook.example.com/',
};

describe('外网正式版启动', () => {
    it('沿用原数据目录、密钥和固定网址，只监听本机端口', () => {
        expect(runtimeEnv(project, source)).toMatchObject({
            DATABASE_URL: `file:${path.join(project, 'data/cuoyin-fork.db')}`,
            CONFIG_DIR: path.join(project, 'config'),
            NEXTAUTH_SECRET: source.NEXTAUTH_SECRET,
            NEXTAUTH_URL: 'https://notebook.example.com',
            NEXTAUTH_URL_INTERNAL: 'http://127.0.0.1:3334',
            HOSTNAME: '127.0.0.1',
            PORT: '3334',
            NODE_ENV: 'production',
            PRESERVE_EXISTING_DATA: 'true',
        });
        expect(source.NEXTAUTH_URL).toBe('http://localhost:3333');
    });

    it('保留绝对数据库路径，解析自定义配置目录', () => {
        const env = runtimeEnv(project, { ...source, DATABASE_URL: 'file:/srv/saved.db', CONFIG_DIR: 'saved-config' });
        expect(env.DATABASE_URL).toBe('file:/srv/saved.db');
        expect(env.CONFIG_DIR).toBe(path.join(project, 'saved-config'));
    });

    it.each(['', 'http://example.com', 'https://a:b@example.com', 'https://example.com/path', 'https://example.com/?token=x', 'https://example.com/#x'])(
        '拒绝缺失或不适合登录回调的网址 %s', value => {
            expect(() => runtimeEnv(project, { ...source, CUOYIN_PUBLIC_URL: value })).toThrow();
        },
    );

    it('本机预览允许无外网地址，且不跳转到外部网站', () => {
        expect(runtimeEnv(project, { ...source, CUOYIN_PUBLIC_URL: '' }, true).NEXTAUTH_URL).toBe('http://localhost:3334');
    });

    it('拒绝缺失的数据库地址和弱会话密钥', () => {
        expect(() => runtimeEnv(project, { ...source, DATABASE_URL: '' })).toThrow('SQLite');
        expect(() => runtimeEnv(project, { ...source, NEXTAUTH_SECRET: 'short' })).toThrow('会话密钥');
    });

    const users = [{ password: 'hashed' }];
    const changedPassword = async () => false;
    it('阻止初始密码、空账号和公开注册', async () => {
        await expect(checkAccounts([], changedPassword, {}, {})).rejects.toThrow('创建账号');
        await expect(checkAccounts(users, async () => true, {}, {})).rejects.toThrow('初始密码');
        await expect(checkAccounts(users, changedPassword, { allowRegistration: true }, {})).rejects.toThrow('关闭公开注册');
        await expect(checkAccounts(users, changedPassword, {}, { ALLOW_REGISTRATION: 'true' })).rejects.toThrow('关闭公开注册');
    });

    it('网页已关闭注册时覆盖环境默认值；正常账号可启动', async () => {
        await expect(checkAccounts(users, changedPassword, { allowRegistration: false }, { ALLOW_REGISTRATION: 'true' })).resolves.toBeUndefined();
    });
});
