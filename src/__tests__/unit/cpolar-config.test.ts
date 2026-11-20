import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTunnel, getTunnelTarget, hasToken, withCertificate, withToken } from '../../../scripts/cpolar-config.mjs';

const token = 'test-token-only-1234567890';

function createTunnelConfig() {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'cpolar-test-'));
    const certificate = path.join(directory, 'domain.crt');
    const privateKey = path.join(directory, 'domain.key');
    writeFileSync(certificate, 'test certificate');
    writeFileSync(privateKey, 'test private key');
    return {
        directory,
        config: `tunnels:\n  cuoyin:\n    proto: http\n    addr: 127.0.0.1:3334\n    crt: ${JSON.stringify(certificate)}\n    key: ${JSON.stringify(privateKey)}\n`,
    };
}

describe('cpolar 本机配置', () => {
    it('添加令牌并保持已有隧道配置', () => {
        const tunnel = createTunnelConfig();
        const current = tunnel.config;
        const result = withToken(current, `  ${token}\n`);
        expect(result).toContain(current);
        expect(hasToken(result)).toBe(true);
        try {
            expect(() => checkTunnel(result)).not.toThrow();
        } finally {
            rmSync(tunnel.directory, { recursive: true, force: true });
        }
    });
    it('更换令牌不重复字段或改动其他配置', () => {
        const result = withToken('authtoken: old\nregion: hk\n', token);
        expect(result).toBe(`authtoken: "${token}"\nregion: hk\n`);
    });
    it('设置或更新证书路径时保留其他隧道设置', () => {
        const config = 'tunnels:\n  cuoyin:\n    proto: http\n    addr: 127.0.0.1:3334\n    hostname: shaochenyue.asia\n    bind_tls: true\n';
        const first = withCertificate(config, '/private/domain.crt', '/private/domain.key');
        const updated = withCertificate(first, '/private/renewed.crt', '/private/renewed.key');
        expect(updated).toContain('    bind_tls: true\n');
        expect(updated).toContain('    crt: "/private/renewed.crt"\n');
        expect(updated).toContain('    key: "/private/renewed.key"\n');
        expect(updated.match(/^    crt:/gm)).toHaveLength(1);
        expect(updated.match(/^    key:/gm)).toHaveLength(1);
    });
    it.each(['', 'short', 'a'.repeat(257), 'a'.repeat(20) + '\ntunnels: {}', 'token with spaces 123456'])('拒绝无效输入 %s', value => {
        expect(() => withToken('tunnels: {}\n', value)).toThrow('令牌格式');
    });
    it('缺少授权或固定隧道时阻止外网启动', () => {
        expect(() => checkTunnel('tunnels: {}\n')).toThrow('本机授权');
        expect(() => checkTunnel(withToken('tunnels: {}\n', token))).toThrow('固定域名隧道');
    });
    it('证书或私钥未配置、文件不存在时阻止外网启动', () => {
        const missingPaths = withToken('tunnels:\n  cuoyin:\n    proto: http\n', token);
        expect(() => checkTunnel(missingPaths)).toThrow('证书尚未配置');

        const tunnel = createTunnelConfig();
        const missingCertificate = withToken(tunnel.config.replace('domain.crt', 'missing.crt'), token);
        try {
            expect(() => checkTunnel(missingCertificate)).toThrow('找不到固定域名 HTTPS 证书');
        } finally {
            rmSync(tunnel.directory, { recursive: true, force: true });
        }
    });
    it('已预留的 cpolar 二级域名无需自备证书', () => {
        const config = withToken('region: cn_vip_top\ntunnels:\n  cuoyin:\n    proto: http\n    addr: 127.0.0.1:3334\n    subdomain: cuoyinagent\n', token);
        expect(() => checkTunnel(config)).not.toThrow();
        expect(() => checkTunnel(config.replace('cn_vip_top', 'hk'))).toThrow('地区');
        expect(() => checkTunnel(config.replace('cuoyinagent', 'bad domain'))).toThrow('二级域名');
    });
    it('读取隧道目标以区分本机和群晖服务', () => {
        expect(getTunnelTarget('tunnels:\n  cuoyin:\n    addr: 127.0.0.1:3334\n')).toBe('127.0.0.1:3334');
        expect(getTunnelTarget('tunnels:\n  cuoyin:\n    addr: DS220plus.local:39301\n')).toBe('DS220plus.local:39301');
        expect(() => getTunnelTarget('tunnels:\n  cuoyin:\n    addr: invalid\n')).toThrow('本地地址');
    });
});
