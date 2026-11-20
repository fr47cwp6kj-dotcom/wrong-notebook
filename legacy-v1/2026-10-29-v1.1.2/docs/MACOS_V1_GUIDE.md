# macOS V1 使用说明

## 适用范围

`app/cuoyin_v1.py` 本身跨平台，macOS 可以直接运行。它负责本地照片收件箱的初始化、统计、校验、索引和报告。

当前仓库里的 `Initialize-PhotoInbox.ps1`、`Test-PhotoInbox.ps1` 和 `cuoyin-v1.cmd` 仅适用于 Windows；macOS 不需要运行它们。

## 启动

在终端执行：

```bash
./scripts/cuoyin-v1.command
```

也可以直接运行：

```bash
python3 app/cuoyin_v1.py
```

macOS 默认使用：

```text
~/Documents/错因Agent
```

## 常用命令

```bash
python3 app/cuoyin_v1.py init
python3 app/cuoyin_v1.py status
python3 app/cuoyin_v1.py verify
python3 app/cuoyin_v1.py snapshot
python3 app/cuoyin_v1.py report
```

指定自定义目录：

```bash
python3 app/cuoyin_v1.py init --root "$HOME/Documents/错因Agent"
python3 app/cuoyin_v1.py status --root "$HOME/Documents/错因Agent" --json
```

## iPhone 照片进入 Mac

V1 在 macOS 上有两种简单方式：

1. **AirDrop 后手工归档**：iPhone 照片分享到 Mac，再移动到 `~/Documents/错因Agent/错题/初中/待识别` 或 `高中/待识别`。
2. **先打开收件箱再拖入**：运行程序菜单中的 `6. 打开错题文件夹`，把 AirDrop 收到的照片拖入对应目录。

如果希望 iPhone「文件」App 直接通过局域网 SMB 连接 macOS，需要在系统设置里单独配置 macOS 文件共享，并只授权具体账户访问 `错题` 文件夹。不要开启来宾写入，也不要把文件共享暴露到不可信网络。

## macOS 日常验收

1. 运行 `init`。
2. 将 iPhone 拍摄的一张真实错题照片放入 `初中/待识别` 或 `高中/待识别`。
3. 运行 `status`，确认数量增加。
4. 运行 `verify`，确认无错误。
5. 运行 `snapshot`，生成 `data/photo-index.json`。
6. 运行 `report`，生成本地报告。

## 权限提示

如果程序需要访问桌面、文稿、下载或照片等受 macOS 隐私权限保护的位置，系统可能提示授权。只授予实际需要的目录访问权限即可。
