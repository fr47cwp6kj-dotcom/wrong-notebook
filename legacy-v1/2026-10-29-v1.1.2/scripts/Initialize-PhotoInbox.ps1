#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RootPath,

    [switch]$CreateShare,

    [ValidateNotNullOrEmpty()]
    [string]$ShareName = "错因Agent照片",

    [Parameter(ParameterSetName = 'Share')]
    [Alias('FullAccessAccount')]
    [ValidateCount(1, 100)]
    [ValidateNotNullOrEmpty()]
    [string[]]$ReadWriteAccount,

    [switch]$RequireSmbEncryption
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

function Get-DefaultRootPath {
    if (Test-Path -LiteralPath 'D:\') {
        return 'D:\错因Agent'
    }

    return (Join-Path -Path ([Environment]::GetFolderPath('MyDocuments')) -ChildPath '错因Agent')
}

function Test-WindowsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object -TypeName Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ([string]::IsNullOrWhiteSpace($RootPath)) {
    $RootPath = Get-DefaultRootPath
}

$RootPath = [Environment]::ExpandEnvironmentVariables($RootPath)
$RootPath = [IO.Path]::GetFullPath($RootPath)
$InboxPath = Join-Path -Path $RootPath -ChildPath '错题'
$RelativeFolders = @(
    '错题\初中\待识别',
    '错题\初中\已归档',
    '错题\初中\识别失败',
    '错题\高中\待识别',
    '错题\高中\已归档',
    '错题\高中\识别失败'
)

if ($CreateShare -and -not $ReadWriteAccount) {
    throw "使用 -CreateShare 时必须提供 -ReadWriteAccount，例如 @('COMPUTERNAME\USERNAME')。"
}

foreach ($RelativePath in $RelativeFolders) {
    $TargetPath = Join-Path -Path $RootPath -ChildPath $RelativePath
    if (-not (Test-Path -LiteralPath $TargetPath -PathType Container)) {
        New-Item -Path $TargetPath -ItemType Directory | Out-Null
    }
}

$MarkerPath = Join-Path -Path $RootPath -ChildPath '.错因Agent'
$MarkerContent = @(
    'project=错因Agent'
    'schema=photo-inbox-v1'
    ('initialized_utc=' + (Get-Date).ToUniversalTime().ToString('o'))
) -join [Environment]::NewLine
Set-Content -LiteralPath $MarkerPath -Value $MarkerContent -Encoding UTF8

$GuidePath = Join-Path -Path $InboxPath -ChildPath 'README.txt'
Set-Content -LiteralPath $GuidePath -Value @(
    '错因Agent V1 照片收件箱'
    '日常上传位置：初中/待识别 或 高中/待识别。'
    '安全提醒：不要将 SMB 445 端口暴露到公网，不要开启匿名写入。'
) -Encoding UTF8

if ($CreateShare) {
    if (-not $env:OS) {
        throw "SMB 共享配置仅支持 Windows。"
    }

    if (-not (Test-WindowsAdmin)) {
        throw "配置 SMB 共享需要在管理员 PowerShell 中运行。"
    }

    $SmbFirewallRule = Get-NetFirewallRule -Name 'FPS-SMB-In-TCP' -ErrorAction SilentlyContinue
    if (-not $SmbFirewallRule) {
        throw "未找到 Windows SMB 防火墙规则 FPS-SMB-In-TCP。请确认系统为 Windows 10/11。"
    }

    Set-NetFirewallRule -Name 'FPS-SMB-In-TCP' -Profile Private
    Enable-NetFirewallRule -Name 'FPS-SMB-In-TCP'

    foreach ($Account in $ReadWriteAccount) {
        & icacls.exe $InboxPath /grant "$($Account):(OI)(CI)(M)"
        if ($LASTEXITCODE -ne 0) {
            throw "无法为账户 $Account 设置 NTFS 修改权限。"
        }
    }

    $ExistingShare = Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue
    if ($ExistingShare) {
        $ExpectedPath = $InboxPath.TrimEnd('\')
        $ActualPath = $ExistingShare.Path.TrimEnd('\')
        if ($ActualPath -ne $ExpectedPath) {
            throw "共享 $ShareName 已存在，但路径是 $ActualPath。请先人工确认，不能自动改指向。"
        }

        $CurrentAccess = Get-SmbShareAccess -Name $ShareName
        $UnsafeAccess = $CurrentAccess | Where-Object {
            $_.AccountName -in @('Everyone', 'Guests', 'Guest') -and
            $_.AccessRight -in @('Read', 'Change', 'Full')
        }

        if ($UnsafeAccess) {
            $UnsafeNames = ($UnsafeAccess | Select-Object -ExpandProperty AccountName) -join ', '
            throw "共享 $ShareName 存在 $UnsafeNames 的访问权限。请先运行 Revoke-SmbShareAccess 移除后再初始化。"
        }

        foreach ($Account in $ReadWriteAccount) {
            $HasAccess = $CurrentAccess | Where-Object {
                $_.AccountName -ieq $Account -and
                $_.AccessRight -in @('Change', 'Full')
            }

            if (-not $HasAccess) {
                Grant-SmbShareAccess -Name $ShareName -AccountName $Account -AccessRight Change -Force
            }
        }
    }
    else {
        $ShareArguments = @{
            Name = $ShareName
            Path = $InboxPath
            ChangeAccess = $ReadWriteAccount
            FolderEnumerationMode = 'AccessBased'
            CachingMode = 'Documents'
        }

        if ($RequireSmbEncryption) {
            $ShareArguments.EncryptData = $true
        }

        New-SmbShare @ShareArguments
    }
}

$NetworkProfiles = Get-NetConnectionProfile
$PublicProfiles = @($NetworkProfiles | Where-Object { $_.NetworkCategory -eq 'Public' })
if ($PublicProfiles.Count -gt 0) {
    Write-Warning "当前存在公共网络配置。公共网络不适合 SMB 共享，请先在 Windows 网络设置中确认家庭 Wi-Fi为专用网络。"
}

$IPv4Addresses = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -ne 'WellKnown'
    } |
    Select-Object -ExpandProperty IPAddress

Write-Host ''
Write-Host '照片收件箱已初始化。'
Write-Host "根目录：$RootPath"
Write-Host "共享目录：$InboxPath"
if ($CreateShare) {
    Write-Host "共享名：$ShareName"
}
if ($IPv4Addresses) {
    Write-Host 'iPhone 可尝试的服务器地址：'
    foreach ($Address in $IPv4Addresses) {
        Write-Host "  smb://$Address"
    }
}
Write-Host ''
Write-Host '下一步：运行 scripts\Test-PhotoInbox.ps1，然后用 iPhone 上传一张测试照片。'
