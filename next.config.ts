import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 外网正式版单独构建，避免覆盖正在使用的本地开发版。
  distDir: process.env.CUOYIN_REMOTE_BUILD === '1' ? 'build/remote-next' : '.next',
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  // 禁止 next dev 自动向 AGENTS.md / CLAUDE.md 写入 agent-rules 段落
  agentRules: false,
};

export default nextConfig;
