import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = path.join(root, 'data', 'cpolar', 'cpolar.yml');

/** 令牌经标准输入读取，避免进入命令参数、终端回显或日志。 */
export function withToken(current, input) {
    const token = input.trim();
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(token)) throw new Error('令牌格式不正确，请从 cpolar 后台的“验证”页复制完整令牌。');
    const setting = `authtoken: ${JSON.stringify(token)}`;
    return /^authtoken:.*$/m.test(current)
        ? current.replace(/^authtoken:.*$/m, setting)
        : `${setting}\n${current}`;
}

export function hasToken(current) {
    return /^authtoken:\s*["']?[A-Za-z0-9_-]{16,256}["']?\s*$/m.test(current);
}

export function withCertificate(current, certificatePath, privateKeyPath) {
    if (!/^  cuoyin:\s*$/m.test(current)) throw new Error('固定域名隧道还未配置。');
    const certificate = `    crt: ${JSON.stringify(path.resolve(certificatePath))}`;
    const privateKey = `    key: ${JSON.stringify(path.resolve(privateKeyPath))}`;
    let next = current.replace(/^    crt:.*$/m, certificate).replace(/^    key:.*$/m, privateKey);

    if (!/^    crt:/m.test(next)) next = next.replace(/^(    hostname:.*)$/m, `$1\n${certificate}`);
    if (!/^    key:/m.test(next)) next = next.replace(/^(    crt:.*)$/m, `$1\n${privateKey}`);
    if (!/^    crt:/m.test(next) || !/^    key:/m.test(next)) throw new Error('固定域名隧道缺少主机名配置。');
    return next;
}

export function checkTunnel(current) {
    if (!hasToken(current)) throw new Error('请先双击“配置cpolar账号.command”完成本机授权。');
    if (!/^  cuoyin:\s*$/m.test(current)) throw new Error('固定域名隧道还未配置，请先完成域名预留、解析和 HTTPS 证书。');

    const crt = /^    crt:\s*("[^"\n]+")\s*$/m.exec(current)?.[1];
    const key = /^    key:\s*("[^"\n]+")\s*$/m.exec(current)?.[1];
    if (!crt || !key) throw new Error('固定域名 HTTPS 证书尚未配置。');

    const certificatePath = JSON.parse(crt);
    const privateKeyPath = JSON.parse(key);
    if (!existsSync(certificatePath) || !existsSync(privateKeyPath)) {
        throw new Error('找不到固定域名 HTTPS 证书或私钥文件。');
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const current = existsSync(configFile) ? readFileSync(configFile, 'utf8') : 'web_addr: 127.0.0.1:4040\nlog_level: info\nlog: false\ntunnels: {}\n';
        if (process.argv.includes('--save-token')) {
            let input = '';
            for await (const chunk of process.stdin) input += chunk;
            const next = withToken(current, input);
            mkdirSync(path.dirname(configFile), { recursive: true, mode: 0o700 });
            writeFileSync(configFile, next, { mode: 0o600 });
            chmodSync(configFile, 0o600);
            console.info('账号授权已保存到本机。');
        } else if (process.argv.includes('--set-certificate')) {
            const index = process.argv.indexOf('--set-certificate');
            const next = withCertificate(current, process.argv[index + 1], process.argv[index + 2]);
            writeFileSync(configFile, next, { mode: 0o600 });
            chmodSync(configFile, 0o600);
            console.info('固定域名证书路径已保存到本机。');
        } else {
            checkTunnel(current);
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
