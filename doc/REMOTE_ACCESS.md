# 错因 Agent 固定网址访问

正式版沿用本地版的账号、数据库和 AI 设置。默认在本机 `127.0.0.1:3334` 运行，由用户已有的穿透服务接到固定 HTTPS 网址；原来的 `localhost:3333` 继续用于本机开发。

## 接入步骤

1. 在穿透平台把固定域名的目标设为 `http://127.0.0.1:3334`，开启 HTTPS。域名、账号和客户端授权按平台要求办理；令牌只保存在本机，不写入源码或聊天。
2. 在项目 `.env` 增加 `CUOYIN_PUBLIC_URL="https://你的固定域名"`，不带路径或参数。
3. 首次使用或修改程序后，执行 `node scripts/start-cuoyin-production.mjs --prepare`。这是外网运行所需的生产构建，写入独立的 `build/remote-next`，不覆盖本地开发版。
4. 双击 **启动错因Agent正式版.command**，同时保持穿透客户端运行。外面的手机或电脑打开固定网址，用现有账号登录。

启动器会检查公开注册已关闭、现有活跃账号没有使用初始密码、会话密钥已配置；只执行增量迁移，不创建新账号、初始化或清空数据库。正式版登录回调使用固定 HTTPS 网址，内部会话查询走本机地址。

本机试运行可以使用 `node scripts/start-cuoyin-production.mjs --local`，打开 `http://localhost:3334`；此模式不会建立外网连接。正常启动缺少固定网址时会停止并显示提示。

## 停止与更新

正式版窗口按 Ctrl+C 停止应用；穿透客户端按该平台的方式停止。电脑需要开机、保持联网并避免睡眠；固定网址不会让关机的电脑继续提供服务。重启电脑后重新运行应用和穿透客户端。

修改程序后先停止正式版，再运行 `--prepare` 重新构建，完成后重启。数据库和配置仍使用原目录，备份方法与本地版一致。不要把整个构建目录发给别人。

## cpolar 一键入口

cpolar 客户端和私有配置放在被 Git 忽略的 `data/cpolar/`。Mac ARM64 客户端来自 [cpolar 官方下载页](https://www.cpolar.com/download)，当前安装版本为 3.3.12。

首次在 cpolar 后台的「验证」页复制 Authtoken，双击 **配置cpolar账号.command**，在本机终端粘贴并回车。输入不回显，也不进入命令历史；配置文件仅当前用户可读写。不要将令牌发到聊天或写入源码。

在私有配置 `data/cpolar/cpolar.yml` 中使用名为 `cuoyin` 的隧道。目标 `addr` 为 `127.0.0.1:3334` 时，启动文件会启动 Mac 本机正式版；目标为 NAS 的局域网地址时，它先检查 `/api/health`，再只启动隧道。使用 cpolar 固定二级域名时，设置已预留的 `subdomain` 和相同的 `region`，无需自备证书。仅在使用本机正式版时，`.env` 的 `CUOYIN_PUBLIC_URL` 须填写实际 HTTPS 地址。自定义域名仍需完成对应线路要求的预留、DNS 与证书配置，参见 [cpolar 自定义域名说明](https://www.cpolar.com/blog/configure-your-own-domain-name-2)。

双击 **启动错因Agent外网.command** 会启动正式版，确认就绪后启动 `cuoyin` 隧道；缺少授权或固定隧道时会停止，不会生成随机网址。它也会在运行期间阻止电脑因闲置自动睡眠。按 Ctrl+C 或关闭窗口时一起停止。合盖、主动睡眠、断网或关机仍会中断访问。

2026-11-15 接入状态：账户为专业套餐，China VIP Top 固定二级域名 `cuoyinagent` 转发到群晖已有的错因 Agent；群晖原账号和记录仍在群晖数据库中。Mac 本机数据库独立保留。未备案的自定义域名 `shaochenyue.asia` 不用于大陆线路；其 cpolar 预留仍保留。若 NAS 的局域网 IP 变化，须同步更新私有隧道配置中的 `addr`。

## English

The production launcher reuses the current SQLite database, accounts, configuration and session secret. It listens only on `127.0.0.1:3334`; configure your existing tunnel provider to forward a fixed HTTPS hostname to `http://127.0.0.1:3334`. Set `CUOYIN_PUBLIC_URL="https://your-hostname"` in `.env`, without paths or query parameters.

Build with `node scripts/start-cuoyin-production.mjs --prepare`, then run `启动错因Agent正式版.command` and your tunnel client. The independent output directory is `build/remote-next`. The original development server on port 3333 remains separate. `--local` starts a local production preview at `http://localhost:3334` without opening a tunnel.

Startup requires registration to be closed, active accounts to have changed the initial password, and a strong session secret. Only incremental migrations run. Stop production before rebuilding after source changes. Keep the computer awake, online and both processes running; restart them after reboot. The fixed URL and provider authorization still have to be configured before remote access works.

For cpolar, the ARM64 client and private configuration live in the ignored `data/cpolar/` directory. Run `配置cpolar账号.command` to paste the account token locally with hidden input. Reserve a fixed subdomain and set matching `subdomain` and `region` values in the named `cuoyin` tunnel; no separate certificate is needed. `启动错因Agent外网.command` starts local production only when the tunnel targets `127.0.0.1:3334`; for a NAS target, it checks `/api/health` and starts only the tunnel. Set `CUOYIN_PUBLIC_URL` to the HTTPS URL when using local production. A custom hostname still requires the provider's DNS and certificate setup. Closing the window or losing the Mac-to-NAS connection interrupts this tunnel.
