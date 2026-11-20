# AGENTS.md

本文件只保留在本仓库工作时必须预先知道的约束；可从代码、`package.json` 或专题文档查到的细节按需读取，不预载入上下文。

## 项目与技术栈

wrong-notebook 是错题本 Web 应用，支持题目图片/文字识别、AI 解析与知识点标注，以及错题管理、练习、统计和打印导出。

- Next.js 16（App Router）、React 19、TypeScript、Tailwind CSS 4、Radix UI
- Prisma 5 + SQLite；NextAuth v4
- AI 提供商封装在 `src/lib/ai/`
- Vitest（单元/集成）、Playwright（E2E）、Python unittest（部署脚本）

主要位置：`src/app/`（页面与 API）、`src/components/`（组件）、`src/lib/`（业务逻辑）、`prisma/`（模型与迁移）、`packaging/`（安装包）、`scripts/`（CI/部署）、`doc/`（专题文档）。

## 工作原则

- 所有回复、代码注释和提交信息使用简体中文。
- 先检查相关代码、测试和专题文档；保护已有改动，不混入无关重构或格式化。
- 临时脚本、日志和截图放入 `mktemp -d` 创建的系统临时目录，不留在仓库或家目录。
- 密钥只放在 `.env` 或 `config/app-config.json`，不得写入代码、日志或提交；新增环境变量同步 `.env.example`。

## 实现约束

- TypeScript 避免 `any`，优先具体类型或 `unknown`；类型导入使用 `import type`。
- 捕获的错误通过 `@/lib/error-message` 获取文本；API 错误使用 `@/lib/api-errors`。
- 后端日志使用 `@/lib/logger`，前端使用 `@/lib/frontend-logger`，不要直接 `console.log`。
- 组件声明 Props 类型；组件超过约 200 行时优先拆分，可复用逻辑提取为 `src/lib/use-*.ts` hook。
- 导入顺序：React/Next → 第三方 → `@/components` → `@/lib` → types → styles。
- Lint 必须零警告；确需忽略时只在调用处使用 `eslint-disable-next-line` 并说明原因。
- 界面文本集中在 `src/lib/translations.ts`，中英文 key 保持一致；页面移动端优先并兼容桌面端。
- 校验所有用户输入（优先 zod）；数据库访问使用 Prisma 参数化查询并防范 XSS。

## 改动联动

- 修改 AI 调用：同步检查 Gemini、OpenAI、Azure、Anthropic 提供商；提示词集中在 `prompts.ts`。
- 新增国产模型渠道：优先复用 `OpenAIProvider`，在 `src/lib/ai/vendor-presets.ts` 增加预设，并同步测试与文档。
- 修改 Prisma schema：创建并提交正式迁移；迁移须兼容 `PRESERVE_EXISTING_DATA=true` 的既有生产数据。
- 修改导出、导入或新增需备份的数据：同步更新导出 API、导入 API 和 `data-backup.test.ts`。
- 功能、配置或默认值变化：同步 `README.md`、`README.en.md` 及受影响的 `doc/` 页面；Wiki 中英文同步。
- 面向用户的功能变化：同步相邻官网项目 `../wrong-notebook-github-pages`，但其提交与推送作为独立操作处理。

## 验证

```bash
npm run lint
npm run test:unit
npm run test:integration
```

- 逻辑改动至少运行相关测试，并通常运行单元与集成测试；仅文档、样式或注释改动可跳过逻辑测试。
- 测试失败应修复原因，不得删除或弱化断言。
- 除非用户要求或执行完整 CI，不主动运行生产构建。
- 完整 CI：`npm_config_registry=https://registry.npmjs.org bash scripts/ci.sh`（Node.js 22+，包含生产构建）。
- 安装或升级依赖使用 npm 官方源，并确认 `package-lock.json` 未写入 `npmmirror`。

## Git、分支与发布

- `main` 是公开主线，公开远程为 `github`；禁止把私有部署分支的提交或合并记录带入公开历史。详见 `doc/BRANCH_WORKFLOW.md`。
- 提交格式：`<type>: <中文描述>`，type 为 `feat|fix|docs|style|refactor|test|chore|ci`；不添加 AI 署名。
- 按可独立交付的功能拆分提交，每个提交包含对应测试和文档，并应能独立通过检查。
- 本地 `git add` / `git commit` 及推送 Gitea 无需额外确认。
- 推送 GitHub 前：展示 `git status` 和拟推送 diff，取得用户确认；运行 `python3 scripts/check-public-history.py <待推送引用>`，并确保工作副本使用 `.githooks`。
- 预览版标签采用 `v年.月.日-n`；创建或推送正式版 `v年.月.日` 必须由用户确认。发布细节见 `doc/release-guide.md`。
