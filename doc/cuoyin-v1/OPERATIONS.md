# V1 部署与运维

## 初始化位置

脚本默认选择：

1. `D:\错因Agent`：存在 D 盘时优先使用。
2. `当前用户文档目录\错因Agent`：没有 D 盘时使用。

也可以显式指定：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Initialize-PhotoInbox.ps1 `
  -RootPath "E:\错因Agent" `
  -CreateShare `
  -ReadWriteAccount @("COMPUTERNAME\USERNAME")
```

## 权限模型

初始化脚本创建两层授权：

- NTFS 权限：授权账户对 `错题` 及其子目录有修改权限。
- SMB 共享权限：同一账户仅有写入所需的 Change 权限。

共享名默认为 `错因Agent照片`，只指向 `错题` 目录。脚不会共享 Windows 系统盘、用户目录或整个磁盘。

配置共享时，脚本会将 Windows 防火墙规则 `FPS-SMB-In-TCP` 限定在专用网络并启用它。这样可以允许家庭局域网 SMB，同时避免把 445 端口开放给公共网络。

## 电脑唤醒与可用性

SMB 上传依赖 Windows 保持在线：

- 需要上传的时间段内，避免电脑进入睡眠。
- 可以临时使用电源设置中的唤醒需求，但不建议长期禁止睡眠。
- 电脑重启后不需要重新创建共享，但需确认网络仍为专用网络。
- 家庭网络地址可能变化；路由器可为电脑设置 DHCP 保留地址。

## 日常流程

1. 学生或家长用 iPhone 拍摄错题。
2. 通过「文件」App 上传到对应学段 `待识别`。
3. Windows 端保留原始照片。
4. 每周至少备份一次 `错因Agent` 目录。
5. 若目录中出现大量图片，先按日期和学段整理，不改变原始文件内容。

## 故障排查

### 查看共享状态

```powershell
Get-SmbShare
Get-SmbShareAccess -Name "错因Agent照片"
```

### 查看本机地址

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" }
```

### 检查网络类别

```powershell
Get-NetConnectionProfile
```

若 `NetworkCategory` 为 `Public`，应先切换到专用网络再共享。

### 检查 445 监听

```powershell
Get-NetTCPConnection -LocalPort 445 -State Listen
```

### 移除共享

不再使用时可以移除 SMB 共享；本地目录和照片会保留：

```powershell
Remove-SmbShare -Name "错因Agent照片" -Force
```
