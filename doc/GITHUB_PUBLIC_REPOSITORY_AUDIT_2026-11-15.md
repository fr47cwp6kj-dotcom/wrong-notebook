# GitHub 公开仓库检查记录

检查日期：2026-11-15  
目标仓库：<https://github.com/fr47cwp6kj-dotcom/wrong-notebook>  
检查基准：公开仓库 `main` 分支提交 `3dffd00aa7bc94f0a218a13684b290503ba8e1fb`

## 一、结论

本次检查未发现真实 API Key、访问令牌、私钥、数据库文件或本机配置被提交到公开仓库。Git 历史中的常见密钥特征扫描也未发现匹配项。

Claude Code 编写的知识漏洞诊断、候选确认、人工复核、跨题验证、诊断过期和备份恢复等核心功能，在代码中都有对应的数据模型、接口、页面和测试。公开仓库在依赖与数据库客户端版本匹配的隔离环境中通过了全部单元测试、集成测试和 Lint。

当前主要问题集中在公开文档：README 混入了不完整的另一版说明，存在失效链接、错误仓库地址、互相矛盾的安装说明，并且把安全漏洞反馈入口指向了其他人的仓库。建议修正文档后再继续对外宣传或让用户按文档部署。

## 二、敏感信息检查

### 2.1 未发现的敏感信息

未发现以下真实凭据：

- OpenAI、Anthropic、Google Gemini 等模型服务 API Key
- GitHub Personal Access Token
- AWS Access Key
- cpolar、Openclaw 等服务的真实令牌
- RSA、EC 或 OpenSSH 私钥
- `.env`、`app-config.json`、SQLite 数据库、日志或用户备份

`.env.example` 中的空 API Key、`supersecret-dev-secret`，以及测试代码中的 `test-api-key` 等均为示例或测试值，不属于真实凭据。

### 2.2 需要注意的公开信息

1. `.mailmap` 第 6～7 行包含一个 `163.com` 个人邮箱，并记录了 Claude Code 身份映射。该邮箱看起来来自上游项目，不是 API 密钥，但属于公开个人信息。
2. README 和 Wiki 公开了默认管理员账号 `admin@localhost` 与默认密码 `123456`。代码要求首次登录后修改密码，因此这不是泄露的私人密码，但部署文档必须继续强调不能直接用于生产环境。
3. README 前部出现 `legacy-v1`、`doc/cuoyin-v1`、`CUOYIN_FORK.md` 等本地或旧项目结构名称。它们没有包含密钥，但暴露了当前公开仓库并不存在的内部整理痕迹。

## 三、公开文档问题

### 3.1 README 混入另一版项目说明

中文 README 第 1～30 行是一段“错因 Agent”专项说明，第 36 行又重新开始完整的“Smart Wrong Notebook”README，形成两份说明拼接在同一文件中的情况。

英文 README 也存在同样问题，并保留了 `The original upstream README follows.`，与最新提交“去除来源表述”的目的不一致。

影响：

- 项目定位和功能范围看起来前后不一致。
- 用户无法判断前半部分与后半部分哪一份是当前有效说明。
- 搜索引擎和 GitHub 首页会同时展示两套互相冲突的信息。

### 3.2 README 存在失效链接

以下路径被 README 引用，但公开仓库中不存在：

- `doc/REMOTE_ACCESS.md`
- `legacy-v1/2026-10-29-v1.1.2`
- `doc/cuoyin-v1`
- `doc/CUOYIN_FORK.md`
- `doc/MATH_CURRICULUM.md`

英文 README 同样引用了其中多个不存在的路径。

影响：用户点击后得到 404，专项功能的详细说明和验收依据无法查阅。

### 3.3 Docker 安装说明互相矛盾

README 一处声称每次发布都会将镜像发布到 GitHub Container Registry，并给出以下地址：

```text
ghcr.io（如自行发布镜像可替换）
```

该地址是占位文本，不能直接执行。README 后面又写着“Docker 镜像未发布到公共仓库，请自行构建”，与前面的“每次发版都会发布镜像”直接冲突。

影响：用户照抄命令会拉取失败，也无法确定应该使用公开镜像还是自行构建。

### 3.4 安装包说明与当前 Release 不一致

README 声称 Releases 提供 Windows、macOS、Linux、飞牛 OS 和 Android 等安装包。检查 `v2026.11.15` Release 时，实际只有：

- `WrongNotebook-Mac-2026.10.19-arm64.dmg`
- `WrongNotebook-Mac-2026.10.19-arm64.zip`

npm 包 `wrong-notebook@2026.11.15` 已实际发布，这一项说明属实。

影响：Windows、Intel Mac、Linux、飞牛 OS 和 Android 用户会在 Releases 中找不到文档所说的安装包。

### 3.5 大量链接仍指向 `margrop/wrong-notebook`

以下位置仍大量使用原仓库或其他仓库地址：

- `.github/ISSUE_TEMPLATE/`
- `doc/wiki/` 及其中英文 Wiki
- `doc/INSTALL_PACKAGES.md`
- `doc/release-guide.md`
- `packaging/desktop/package.json`
- `packaging/fnos/manifest`
- `packaging/npm/README.md`

其中最重要的是 Issue 模板和安全漏洞报告链接仍指向 `margrop/wrong-notebook`。用户可能把问题、日志或未公开的漏洞详情发送给错误的仓库所有者。

建议将应属于当前项目的链接统一替换为：

```text
https://github.com/fr47cwp6kj-dotcom/wrong-notebook
```

上游来源、许可证归属或确实需要引用原项目的位置不应机械替换，应逐项判断。

### 3.6 发布与版本信息容易混淆

公开标签为 `v2026.11.15`，但安装包文件名和 `package.json` 中仍包含 `2026.10.19`。这不一定导致程序错误，但会让用户难以确认安装包是否对应当前发布。

建议明确区分：

- 应用内部版本
- npm 包版本
- GitHub Release 标签
- 安装包文件名版本

如果采用发布日期版本，应尽量保持四者一致。

## 四、功能核对结果

### 4.1 已确认存在的功能

代码和测试表明，以下功能已实现：

- 知识漏洞候选的 AI 生成与手工录入
- 题干或学生作答证据校验
- 学生确认、不确定和拒绝状态
- 小练内容与答案的人工复核门槛
- 未确认或未复核时不计入掌握结果
- 同一知识单元跨错题复用
- 至少两个原题情境连续独立完成后才判为跨题验证
- 最新失败会重置跨题验证状态
- 修改题干、作答或参考解答后，旧诊断标记过期
- 用户、学段和学科之间的数据隔离
- 未登录用户和其他用户不能读取或修改诊断
- 诊断、知识单元、确认状态与小练历史的导出和导入
- 重复导入时避免重复计数

### 4.2 自动验证结果

| 检查项目 | 结果 |
| --- | --- |
| ESLint | 通过，零警告 |
| 单元测试 | 79 个测试文件，860 项全部通过 |
| 集成测试 | 29 个测试文件，424 项全部通过 |
| 公开历史检查 | 924 个可达 Git 对象通过 |
| npm 依赖审计 | 未发现已知漏洞 |
| Git 历史密钥特征扫描 | 未发现真实密钥 |

第一次集成测试曾因复用了本地新版 Prisma 客户端而失败；在临时副本中重新安装公开仓库匹配的依赖并重新生成 Prisma Client 后，424 项集成测试全部通过。因此第一次失败属于审查环境版本不匹配，不是公开代码缺陷。

### 4.3 尚未验证的范围

本次没有验证以下内容：

- 未运行生产构建或完整 CI
- 未使用真实 OpenAI、MiniMax、Gemini、Anthropic 等账号调用模型
- 未逐个安装和启动 Release 中的 Mac 安装包
- 未验证 GitHub Actions 是否能成功发布 Docker 镜像及所有平台安装包
- 未进行真实浏览器端到端操作验收
- 未对 705 个文件进行逐行安全审计

因此，“代码和自动测试通过”不能等同于“所有模型渠道、安装包和真实用户流程均已验收”。

## 五、建议处理顺序

### 高优先级

1. 修正 Issue 模板、安全漏洞报告地址及其他错误仓库链接。
2. 删除或整合 README 前 30 行的重复专项说明。
3. 删除失效链接，或把对应文档正式加入公开仓库。
4. 明确 Docker 镜像到底是否已发布，并提供唯一、可直接执行的正确命令。

### 中优先级

5. 按当前 Release 的真实资产修改多平台安装说明。
6. 统一 GitHub Release、npm、`package.json` 和安装包文件名的版本规则。
7. 检查 `.mailmap` 中的个人邮箱是否需要继续公开。

### 后续验证

8. 运行完整 CI，包括生产构建。
9. 使用至少一个真实 AI 渠道完成识题、诊断、确认、小练和跨题验证闭环。
10. 实际安装 Mac DMG，并验证首次启动、数据库迁移、AI 配置、备份导出和恢复。
11. 如果继续声称支持其他平台，应生成并实际验证对应安装包后再更新 README。

## 六、本次操作说明

本次仅执行只读检查和临时目录中的测试，没有修改项目文件、公开仓库、Release 或 npm 包，也没有向 GitHub 推送任何内容。
