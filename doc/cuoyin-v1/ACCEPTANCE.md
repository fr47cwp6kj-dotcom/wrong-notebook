# V1 实机验收

V1 的最低验收标准只有一条：**iPhone 在同一家庭局域网内上传 1 张真实错题照片，Windows 对应 `待识别` 目录中可见且能打开。**

## 验收步骤

1. 在 Windows 管理员 PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Test-PhotoInbox.ps1
```

确认目录、共享、监听和安全项没有失败。

2. 记录检查脚本输出的局域网 IPv4 地址。
3. iPhone「文件」App 连接 `smb://<Windows地址>`。
4. 使用授权账户登录。
5. 上传一张真实错题照片到 `初中/待识别` 或 `高中/待识别`。
6. 在 Windows 中打开该照片，确认图像清晰、方向正确、可读。
7. 再次运行检查脚本，确认对应 `待识别` 目录的照片数量增加。
8. 运行 `scripts\cuoyin-v1.cmd`，执行“校验照片文件”“生成照片索引”“生成本地报告”。
9. 复制 [验收记录模板](../templates/acceptance-record.md) 并填写结果。

## 通过标准

- 手机连接成功。
- 能看到 `初中/待识别` 与 `高中/待识别`。
- 至少一张照片上传成功。
- Windows 能打开照片。
- 再次运行检查脚本时无 `FAIL`。
- `Everyone`、`Guests`、`Guest` 没有共享写入权限。
- SMB 防火墙规则只覆盖专用网络，且 SMB1 保持禁用。

## 未通过时的处理顺序

1. 运行 `Test-PhotoInbox.ps1`，先处理 `FAIL`。
2. 确认 Windows 和 iPhone 均在家庭局域网，且网络不是公共配置。
3. 使用完整 Windows 账户名重试。
4. 检查电脑是否休眠或防火墙拦截 SMB。
5. 若仍失败，记录系统版本、iPhone iOS 版本、IP、共享名和错误提示，再进入排查。
