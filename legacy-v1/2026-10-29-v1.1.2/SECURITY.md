# 安全与隐私说明

## V1 必须执行

1. SMB 共享只指向 `错题` 目录，不共享整个用户目录或磁盘。
2. 只授权明确的 Windows 账户，不给 `Everyone`、`Guests` 或匿名账户写入权限。
3. 不要在路由器上把 445 端口映射到公网。
4. 网络配置应为专用网络；SMB 防火墙规则不得覆盖公共网络。
5. 保持 SMB 1.0 禁用。
6. Windows 账户使用强密码；无密码本地账户不适合用于 SMB 访问。
7. 定期备份 `错因Agent` 目录，至少保留一份离线或异地副本。

## 隐私处理

- 错题照片可能包含学生姓名、班级、学校、教师批注或家庭环境信息。
- V1 阶段数据不离开家庭设备；不要把原始目录同步到不受控的公有云。
- V2 引入模型前，需要再次确认模型运行位置、日志落盘位置和网络访问行为。
- 对外展示截图、求助于他人排查时，先遮盖身份信息。

## 共享审计

可在 Windows PowerShell 中运行：

```powershell
Get-SmbShare -Name "错因Agent照片"
Get-SmbShareAccess -Name "错因Agent照片"
```

如果发现 `Everyone`、`Guests` 或 `Guest` 具有访问权限，应立即移除：

```powershell
Revoke-SmbShareAccess -Name "错因Agent照片" -AccountName Everyone -Force
Revoke-SmbShareAccess -Name "错因Agent照片" -AccountName Guests -Force
```

移除后重新运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Test-PhotoInbox.ps1
```
