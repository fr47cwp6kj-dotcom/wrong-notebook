# V1 程序使用说明

## 定位

`app/cuoyin_v1.py` 是 V1 的本地照片收件箱管理程序。它解决收集落地后的四个问题：

1. 目录是否存在。
2. 手机照片是否真的到达本机。
3. 照片文件是否可读、扩展名是否可信。
4. 是否已生成可追溯的照片索引和本地报告。

它不做 SMB 共享配置；共享初始化仍使用 `scripts/Initialize-PhotoInbox.ps1`。它也不做 OCR、AI 诊断、变式题或复习调度。

程序使用 Python 标准库，无第三方依赖；建议 Python 3.10 或更新版本。

## Windows 启动

```bat
scripts\cuoyin-v1.cmd
```

没有参数时进入交互菜单，适合家长日常使用。

## macOS 启动

```bash
./scripts/cuoyin-v1.command
```

或：

```bash
python3 app/cuoyin_v1.py
```

默认根目录为 `~/Documents/错因Agent`。

## 命令行用法

```powershell
python .\app\cuoyin_v1.py init --root "D:\错因Agent"
python .\app\cuoyin_v1.py status --root "D:\错因Agent"
python .\app\cuoyin_v1.py verify --root "D:\错因Agent"
python .\app\cuoyin_v1.py snapshot --root "D:\错因Agent"
python .\app\cuoyin_v1.py report --root "D:\错因Agent"
```

如果不传 `--root`，Windows 有 D 盘时默认 `D:\错因Agent`，否则使用当前用户文档目录下的 `错因Agent`。

## 命令说明

| 命令 | 作用 | 输出 |
| --- | --- | --- |
| `menu` | 交互菜单 | 终端操作界面 |
| `init` | 创建或修复目录 | `错题/初中`、`错题/高中` 等目录 |
| `status` | 统计照片数量和最近文件 | 终端表格或 JSON |
| `verify` | 检查空文件、扩展名、图片签名、重复文件 | 校验结果；发现错误时退出码为 1 |
| `snapshot` | 计算 SHA-256 并生成索引 | `data/photo-index.json` |
| `report` | 生成本地收集报告 | `reports/v1-report-*.md` |

`verify` 支持的图片格式：JPEG、PNG、HEIC/HEIF、WebP。iPhone 默认 HEIC 照片可以直接校验。

`status` 和 `verify` 支持 `--json`，便于后续自动化：

```powershell
python .\app\cuoyin_v1.py status --root "D:\错因Agent" --json
python .\app\cuoyin_v1.py verify --root "D:\错因Agent" --json
```

## 验收顺序

1. 先运行 `scripts/Initialize-PhotoInbox.ps1` 配置 SMB。
2. iPhone 上传一张真实错题照片。
3. 运行 `scripts/cuoyin-v1.cmd`。
4. 选择 `2. 查看收件箱状态`，确认对应 `待识别` 数量增加。
5. 选择 `3. 校验照片文件`，确认无错误。
6. 选择 `4. 生成照片索引`，建立 V2 防重复导入基础。
7. 选择 `5. 生成本地报告`，保存当天收集情况。

## 快照索引

`data/photo-index.json` 保存：

- 相对路径、学段、状态。
- 文件大小与修改时间。
- SHA-256。
- 首次发现和最近发现时间。
- 缺失时间，用于发现照片被移动或删除。

索引不复制照片、不修改原图、不上传数据。

## 退出码

| 命令 | 含义 |
| --- | --- |
| `verify` | 有错误时返回 1，仅警告时返回 0 |
| 其他命令 | 正常执行返回 0 |

这个行为便于以后接入 Windows 计划任务或 V2 服务。
