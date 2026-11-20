# 错因 Agent

家庭本地化错题管理与复习系统。当前仓库交付 **V1：iPhone 拍摄照片并上传到 Windows 本地收件箱**；后续目标是把错题处理成“知识单元漏洞诊断卡”，而不是电子抄题本。

## 当前状态

| 版本 | 目标 | 状态 |
| --- | --- | --- |
| V1 | iPhone 通过 SMB 上传照片，本地程序统计与校验 | 可运行，待实机验收 |
| V2 | 目录监听、OCR/多模态识别、人工校对 | 规划中 |
| V3 | 知识单元漏洞诊断与学生确认 | 规划中 |
| V4 | 卡点小练与变式题生成 | 规划中 |
| V5 | 单元掌握度与复习调度 | 规划中 |
| V6 | 手机本地网页端 | 规划中 |

## 快速开始（Windows）

1. 将本仓库复制到 Windows 电脑，或克隆后同步整个目录。
2. 用管理员身份打开 Windows PowerShell。
3. 仅创建目录结构：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Initialize-PhotoInbox.ps1
```

4. 创建目录并配置受限 SMB 共享。把 `COMPUTERNAME\USERNAME` 换成实际 Windows 账户名：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Initialize-PhotoInbox.ps1 `
  -CreateShare `
  -ReadWriteAccount @("COMPUTERNAME\USERNAME")
```

脚本默认优先使用 `D:\错因Agent`；没有 D 盘时使用当前用户文档目录下的 `错因Agent`。共享只指向 `错题` 文件夹，不共享整个磁盘。

5. 检查配置：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Test-PhotoInbox.ps1
```

6. 按 [iPhone 上传指南](docs/IPHONE_GUIDE.md) 连接共享并上传一张测试照片。
7. 上传后再次运行检查脚本，并填写 [V1 验收记录](docs/ACCEPTANCE.md)。

## V1 程序

### macOS

```bash
./scripts/cuoyin-v1.command
```

或：

```bash
python3 app/cuoyin_v1.py
```

默认根目录为 `~/Documents/错因Agent`。Windows 专用 SMB 初始化脚本不用在 macOS 上执行。

### Windows

Windows 可双击或命令行运行：

```bat
scripts\cuoyin-v1.cmd
```

默认进入交互菜单，可执行：

```text
1. 初始化/修复目录
2. 查看收件箱状态
3. 校验照片文件
4. 生成照片索引
5. 生成本地报告
6. 打开错题文件夹
```

也可以直接使用子命令（macOS 把 `python` 换成 `python3`）：

```powershell
python .\app\cuoyin_v1.py status --root "D:\错因Agent"
python .\app\cuoyin_v1.py verify --root "D:\错因Agent"
python .\app\cuoyin_v1.py snapshot --root "D:\错因Agent"
python .\app\cuoyin_v1.py report --root "D:\错因Agent"
```

程序只管理本地照片文件，不做 OCR、AI 诊断或出题；生成的 `data/photo-index.json` 会为 V2 防重复导入提供 SHA-256 基础。

## 目录结构

```text
错因Agent/
├── app/                      # V1 Python 程序
├── tests/                    # V1 程序单元测试
├── scripts/                  # Windows PowerShell 初始化与检查工具
├── docs/                    # 部署、验收、路线图和数据契约
├── templates/                # 实机验收记录模板
├── SECURITY.md
├── CHANGELOG.md
└── README.md
```

运行初始化脚本后，Windows 端照片目录为：

```text
错因Agent/
└── 错题/
    ├── 初中/
    │   ├── 待识别/
    │   ├── 已归档/
    │   └── 识别失败/
    └── 高中/
        ├── 待识别/
        ├── 已归档/
        └── 识别失败/
```

日常使用时，只需要把照片上传到对应学段的 `待识别` 文件夹。第一版不要求分科、重命名、录入信息，更不要求誊抄题干。

## 核心方法

错因 Agent 的重点不是把错题抄得更整齐，而是定位“卡住的那一小段逻辑”：

1. 找出第一个无法继续的步骤。
2. 找出没有被使用的条件、图形或推导信号。
3. 定位缺失的概念、公式边界、条件变形或知识单元连接。
4. 形成“看到 A + B，先想到 C”的触发规则。
5. 用卡点小练和变式题验证掌握情况。

详见 [知识单元漏洞诊断方法](docs/DIAGNOSIS_METHOD.md)。在 V1 阶段就可以配合 [知识单元漏洞卡](templates/knowledge-gap-card.md) 手工使用，不需要等模型部署。

## 安全边界

- SMB 445 端口不得直接暴露到公网。
- 不开启来宾匿名写入。
- 只给明确的 Windows 账户授予共享和 NTFS 修改权限。
- 电脑离开家庭局域网或进入公共网络时，应关闭 SMB 共享或断开网络共享。
- 原始照片始终保留；后续识别失败时必须能回到原图人工处理。

详见 [SECURITY.md](SECURITY.md)。

## 后续路线

V2 开始才引入目录监听和识别服务。数据结构、状态流转和最小 SQLite 表已定义在 [V2 数据契约](docs/V2_DATA_CONTRACT.md) 中，用于防止后续实现过早绑定某个 OCR 或模型供应商。学习方法上的约束在 [诊断方法](docs/DIAGNOSIS_METHOD.md)、[Agent 行为契约](docs/AGENT_PROMPT_CONTRACT.md) 和 [诊断分类配置](config/diagnosis-taxonomy.json) 中维护。
