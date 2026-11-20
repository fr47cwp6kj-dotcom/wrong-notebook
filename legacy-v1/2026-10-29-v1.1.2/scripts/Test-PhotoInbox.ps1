#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RootPath,

    [ValidateNotNullOrEmpty()]
    [string]$ShareName = "错因Agent照片",

    [switch]$Strict
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Continue'

function Get-DefaultRootPath {
    if (Test-Path -LiteralPath 'D:\') {
        return 'D:\错因Agent'
    }

    return (Join-Path -Path ([Environment]::GetFolderPath('MyDocuments')) -ChildPath '错因Agent')
}

if ([string]::IsNullOrWhiteSpace($RootPath)) {
    $RootPath = Get-DefaultRootPath
}

$RootPath = [Environment]::ExpandEnvironmentVariables($RootPath)
$RootPath = [IO.Path]::GetFullPath($RootPath)
$InboxPath = Join-Path -Path $RootPath -ChildPath '错题'
$Results = New-Object -TypeName System.Collections.Generic.List[object]

function Add-Result {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet('PASS', 'WARN', 'FAIL')][string]$Status,
        [Parameter(Mandatory = $true)][string]$Detail
    )

    if ($Strict -and $Status -eq 'WARN') {
        $Status = 'FAIL'
    }

    $Results.Add([pscustomobject]@{
        Check = $Name
        Status = $Status
        Detail = $Detail
    })
}

$ExpectedFolders = @(
    '错题\初中\待识别',
    '错题\初中\已归档',
    '错题\初中\识别失败',
    '错题\高中\待识别',
    '错题\高中\已归档',
    '错题\高中\识别失败'
)

$MissingFolders = @()
foreach ($RelativePath in $ExpectedFolders) {
    $TargetPath = Join-Path -Path $RootPath -ChildPath $RelativePath
    if (-not (Test-Path -LiteralPath $TargetPath -PathType Container)) {
        $MissingFolders += $TargetPath
    }
}

if ($MissingFolders.Count -eq 0) {
    Add-Result -Name '目录结构' -Status PASS -Detail '初中/高中收件箱目录均存在'
}
else {
    Add-Result -Name '目录结构' -Status FAIL -Detail ('缺少：' + ($MissingFolders -join '；'))
}

$MarkerPath = Join-Path -Path $RootPath -ChildPath '.错因Agent'
if (Test-Path -LiteralPath $MarkerPath -PathType Leaf) {
    Add-Result -Name '项目标记' -Status PASS -Detail '.错因Agent 存在'
}
else {
    Add-Result -Name '项目标记' -Status WARN -Detail '未找到初始化标记；可能是旧目录或手工创建'
}

$SmbShare = $null
try {
    $SmbShare = Get-SmbShare -Name $ShareName -ErrorAction Stop

    $ExpectedPath = $InboxPath.TrimEnd('\')
    $ActualPath = $SmbShare.Path.TrimEnd('\')
    if ($ActualPath -ieq $ExpectedPath) {
        Add-Result -Name 'SMB 共享范围' -Status PASS -Detail "$ShareName -> $ActualPath"
    }
    else {
        Add-Result -Name 'SMB 共享范围' -Status FAIL -Detail "共享指向 $ActualPath，预期 $ExpectedPath"
    }

    $ShareAccess = @(Get-SmbShareAccess -Name $ShareName)
    $UnsafeAccess = @($ShareAccess | Where-Object {
        $_.AccountName -in @('Everyone', 'Guests', 'Guest') -and
        $_.AccessRight -in @('Read', 'Change', 'Full')
    })

    if ($UnsafeAccess.Count -eq 0) {
        $ChangeAccounts = @($ShareAccess | Where-Object { $_.AccessRight -eq 'Change' })
        $FullAccounts = @($ShareAccess | Where-Object { $_.AccessRight -eq 'Full' })
        if ($ChangeAccounts.Count -gt 0) {
            $Names = ($ChangeAccounts | Select-Object -ExpandProperty AccountName) -join ', '
            Add-Result -Name 'SMB 授权' -Status PASS -Detail "可写入账户：$Names"
        }
        elseif ($FullAccounts.Count -gt 0) {
            $Names = ($FullAccounts | Select-Object -ExpandProperty AccountName) -join ', '
            Add-Result -Name 'SMB 授权' -Status WARN -Detail "账户 $Names 拥有完全访问；建议降为 Change"
        }
        else {
            Add-Result -Name 'SMB 授权' -Status FAIL -Detail '没有账户获得共享写入权限'
        }
    }
    else {
        $UnsafeNames = ($UnsafeAccess | Select-Object -ExpandProperty AccountName) -join ', '
        Add-Result -Name 'SMB 授权' -Status FAIL -Detail "检测到不安全账户：$UnsafeNames"
    }
}
catch {
    Add-Result -Name 'SMB 共享' -Status FAIL -Detail "找不到共享 $ShareName"
}

try {
    $Port445 = @(Get-NetTCPConnection -LocalPort 445 -State Listen -ErrorAction Stop)
    if ($Port445.Count -gt 0) {
        Add-Result -Name 'SMB 监听' -Status PASS -Detail '445 端口正在监听'
    }
    else {
        Add-Result -Name 'SMB 监听' -Status FAIL -Detail '445 端口未监听'
    }
}
catch {
    Add-Result -Name 'SMB 监听' -Status FAIL -Detail $_.Exception.Message
}

try {
    $SmbFirewallRule = Get-NetFirewallRule -Name 'FPS-SMB-In-TCP' -ErrorAction Stop
    $Profiles = [string]$SmbFirewallRule.Profile
    $PrivateAllowed = $Profiles -match 'Private'
    $PublicAllowed = $Profiles -match 'Public|Any'

    if ($SmbFirewallRule.Enabled -eq $true -and
        $SmbFirewallRule.Action -eq 'Allow' -and
        $SmbFirewallRule.Direction -eq 'Inbound' -and
        $PrivateAllowed -and -not $PublicAllowed) {
        Add-Result -Name 'SMB 防火墙' -Status PASS -Detail "FPS-SMB-In-TCP 允许专用网络，Profile=$Profiles"
    }
    elseif ($PublicAllowed) {
        Add-Result -Name 'SMB 防火墙' -Status FAIL -Detail "SMB 防火墙覆盖公共网络，Profile=$Profiles"
    }
    else {
        Add-Result -Name 'SMB 防火墙' -Status FAIL -Detail "FPS-SMB-In-TCP 未按要求对专用网络开放"
    }
}
catch {
    Add-Result -Name 'SMB 防火墙' -Status FAIL -Detail $_.Exception.Message
}

try {
    $PublicProfiles = @(Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' })
    if ($PublicProfiles.Count -eq 0) {
        Add-Result -Name '网络类别' -Status PASS -Detail '未检测到公共网络配置'
    }
    else {
        $Names = ($PublicProfiles | Select-Object -ExpandProperty Name) -join ', '
        Add-Result -Name '网络类别' -Status FAIL -Detail "存在公共网络：$Names；请改为专用网络"
    }
}
catch {
    Add-Result -Name '网络类别' -Status WARN -Detail $_.Exception.Message
}

try {
    $SmbServerConfiguration = Get-SmbServerConfiguration -ErrorAction Stop
    if ($SmbServerConfiguration.EnableSMB1Protocol -eq $false) {
        Add-Result -Name 'SMB1' -Status PASS -Detail 'SMB1 已禁用'
    }
    else {
        Add-Result -Name 'SMB1' -Status FAIL -Detail 'SMB1 处于启用状态；请在 Windows 功能中禁用 SMB 1.0'
    }
}
catch {
    Add-Result -Name 'SMB1' -Status WARN -Detail $_.Exception.Message
}

$PhotoExtensions = @('.jpg', '.jpeg', '.png', '.heic', '.webp')
$JuniorPending = Join-Path -Path $InboxPath -ChildPath '初中\待识别'
$SeniorPending = Join-Path -Path $InboxPath -ChildPath '高中\待识别'

try {
    $InboxAcl = Get-Acl -LiteralPath $InboxPath -ErrorAction Stop
    $BroadWriteRules = @($InboxAcl.Access | Where-Object {
        $Identity = [string]$_.IdentityReference
        $IsBroadIdentity = (
            $Identity -ieq 'Everyone' -or
            $Identity -ieq 'BUILTIN\Users' -or
            $Identity -ieq 'NT AUTHORITY\Authenticated Users' -or
            $Identity -like '*S-1-1-0' -or
            $Identity -like '*S-1-5-11' -or
            $Identity -like '*S-1-5-32-545'
        )
        $Rights = ([string]$_.FileSystemRights -split ',\s*')
        $HasWriteRight = @('Write', 'WriteData', 'AppendData', 'CreateFiles', 'CreateDirectories', 'Modify', 'FullControl') |
            Where-Object { $Rights -contains $_ }

        $_.AccessControlType -eq 'Allow' -and $IsBroadIdentity -and $HasWriteRight
    })

    if ($BroadWriteRules.Count -eq 0) {
        Add-Result -Name 'NTFS 宽泛写入' -Status PASS -Detail '未检测到 Everyone/Authenticated Users/Users 写入权限'
    }
    else {
        $BroadNames = ($BroadWriteRules | Select-Object -ExpandProperty IdentityReference) -join ', '
        Add-Result -Name 'NTFS 宽泛写入' -Status FAIL -Detail "检测到 $BroadNames 具有写入权限"
    }
}
catch {
    Add-Result -Name 'NTFS 宽泛写入' -Status WARN -Detail $_.Exception.Message
}

foreach ($PendingPath in @($JuniorPending, $SeniorPending)) {
    $Label = if ($PendingPath -eq $JuniorPending) { '初中/待识别' } else { '高中/待识别' }
    if (-not (Test-Path -LiteralPath $PendingPath -PathType Container)) {
        continue
    }

    $Files = @(Get-ChildItem -LiteralPath $PendingPath -File -ErrorAction SilentlyContinue)
    $Photos = @($Files | Where-Object { $PhotoExtensions -contains $_.Extension.ToLowerInvariant() })
    Add-Result -Name "$Label 照片" -Status PASS -Detail "当前照片数：$($Photos.Count)"

    $Unexpected = @($Files | Where-Object { $PhotoExtensions -notcontains $_.Extension.ToLowerInvariant() })
    if ($Unexpected.Count -gt 0) {
        $Names = ($Unexpected | Select-Object -First 5 -ExpandProperty Name) -join ', '
        Add-Result -Name "$Label 文件类型" -Status WARN -Detail "存在非照片文件：$Names"
    }
}

try {
    $IPv4Addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } |
        Select-Object -ExpandProperty IPAddress

    if (@($IPv4Addresses).Count -gt 0) {
        Add-Result -Name '局域网地址' -Status PASS -Detail (($IPv4Addresses | ForEach-Object { "smb://$_" }) -join '；')
    }
    else {
        Add-Result -Name '局域网地址' -Status WARN -Detail '未找到可用 IPv4 地址'
    }
}
catch {
    Add-Result -Name '局域网地址' -Status WARN -Detail $_.Exception.Message
}

Write-Host ''
Write-Host 'V1 照片收件箱检查'
Write-Host "根目录：$RootPath"
Write-Host ''
$Results | Format-Table -AutoSize

$Failed = @($Results | Where-Object { $_.Status -eq 'FAIL' })
$Warned = @($Results | Where-Object { $_.Status -eq 'WARN' })

if ($Failed.Count -gt 0) {
    Write-Host "结果：失败。FAIL=$($Failed.Count)，WARN=$($Warned.Count)。"
    exit 1
}

if ($Warned.Count -gt 0) {
    Write-Host "结果：通过但有警告。WARN=$($Warned.Count)。"
    exit 0
}

Write-Host '结果：全部通过。'
exit 0
