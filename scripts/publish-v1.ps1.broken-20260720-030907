$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

$repo = 'Eddie135/Beer-Journal'
$remoteUrl = 'https://github.com/Eddie135/Beer-Journal.git'
$tag = 'v1.0.0'

$apkPath = Join-Path $root 'mobile\android\app\build\outputs\apk\release\Beer-Journal-v1.0.0-release.apk'
$shaPath = Join-Path $root 'mobile\android\app\build\outputs\apk\release\Beer-Journal-v1.0.0-SHA256.txt'
$docsIndex = Join-Path $root 'docs\index.html'

$gitPath = (Get-Command git.exe -ErrorAction Stop).Source
$ghPath = (Get-Command gh.exe -ErrorAction Stop).Source

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [switch]$AllowFailure,

        [switch]$Quiet
    )

    if (-not $Quiet) {
        Write-Host "> $FilePath $($Arguments -join ' ')"
    }

    $oldPreference = $ErrorActionPreference

    try {
        # Windows PowerShell 会把原生命令的 stderr 警告包装成错误记录。
        # 这里暂时允许它继续，最终只根据退出代码判断成功与否。
        $ErrorActionPreference = 'Continue'

        $captured = @(
            & $FilePath @Arguments 2>&1
        )

        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }

    $outputLines = @(
        $captured | ForEach-Object {
            if ($null -eq $_) {
                ''
            }
            else {
                $_.ToString()
            }
        }
    )

    $outputText = $outputLines -join [Environment]::NewLine

    if ((-not $Quiet) -and (-not [string]::IsNullOrWhiteSpace($outputText))) {
        Write-Host $outputText
    }

    if (($exitCode -ne 0) -and (-not $AllowFailure)) {
        throw "Command failed with exit code ${exitCode}: $FilePath $($Arguments -join ' ')"
    }

    return [pscustomobject]@{
        ExitCode = [int]$exitCode
        Success  = ($exitCode -eq 0)
        Output   = [string]$outputText
        Lines    = $outputLines
    }
}

Write-Host ''
Write-Host '=================================================='
Write-Host 'Beer Journal 1.0 发布'
Write-Host '=================================================='
Write-Host ''

Write-Host '1. 检查 GitHub 登录状态...'
Invoke-Native -FilePath $ghPath -Arguments @('auth', 'status') | Out-Null

Write-Host ''
Write-Host '2. 检查正式发布文件...'

if (-not (Test-Path -LiteralPath $apkPath)) {
    throw "未找到正式 APK：$apkPath"
}

if (-not (Test-Path -LiteralPath $shaPath)) {
    throw "未找到 SHA-256 文件：$shaPath"
}

if (-not (Test-Path -LiteralPath $docsIndex)) {
    throw "未找到 GitHub Pages 首页：$docsIndex"
}

$actualHash = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
$shaText = Get-Content -LiteralPath $shaPath -Raw

$hashMatch = [regex]::Match($shaText, '(?i)\b[a-f0-9]{64}\b')

if (-not $hashMatch.Success) {
    throw 'SHA-256 文件中没有找到有效的 64 位 SHA-256 值。'
}

$recordedHash = $hashMatch.Value.ToLowerInvariant()

if ($actualHash -ne $recordedHash) {
    throw "APK SHA-256 不一致。实际：$actualHash；记录：$recordedHash"
}

Write-Host "APK SHA-256 已验证：$actualHash"

Write-Host ''
Write-Host '3. 检查 APK 和校验文件不会进入 Git...'

$ignoredPaths = @(
    'mobile/android/app/build/outputs/apk/release/Beer-Journal-v1.0.0-release.apk',
    'mobile/android/app/build/outputs/apk/release/Beer-Journal-v1.0.0-SHA256.txt'
)

foreach ($ignoredPath in $ignoredPaths) {
    $ignoreResult = Invoke-Native `
        -FilePath $gitPath `
        -Arguments @('check-ignore', '-q', '--', $ignoredPath) `
        -AllowFailure `
        -Quiet

    if (-not $ignoreResult.Success) {
        throw "发布产物没有被 .gitignore 忽略，已停止发布：$ignoredPath"
    }
}

$trackedResult = Invoke-Native `
    -FilePath $gitPath `
    -Arguments @('ls-files') `
    -Quiet

$trackedFiles = @(
    $trackedResult.Lines |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
)

$riskyTrackedFiles = @(
    $trackedFiles | Where-Object {
        $_ -match '(?i)(^|/)(keystore\.properties|local\.properties)$' -or
        $_ -match '(?i)\.(keystore|jks|apk|aab|sqlite|sqlite3|db|log)$' -or
        $_ -match '(?i)(^|/)(node_modules|build|dist)/'
    }
)

if ($riskyTrackedFiles.Count -gt 0) {
    Write-Host '发现不应被 Git 跟踪的文件：'
    $riskyTrackedFiles | ForEach-Object { Write-Host "  $_" }
    throw '请先从 Git 索引中移除上述敏感文件或构建产物。'
}

Write-Host '敏感文件和构建产物检查通过。'

Write-Host ''
Write-Host '4. 检查 Git 状态...'

Invoke-Native -FilePath $gitPath -Arguments @('diff', '--check') | Out-Null

$userNameResult = Invoke-Native `
    -FilePath $gitPath `
    -Arguments @('config', 'user.name') `
    -AllowFailure `
    -Quiet

$userEmailResult = Invoke-Native `
    -FilePath $gitPath `
    -Arguments @('config', 'user.email') `
    -AllowFailure `
    -Quiet

if (
    (-not $userNameResult.Success) -or
    [string]::IsNullOrWhiteSpace($userNameResult.Output) -or
    (-not $userEmailResult.Success) -or
    [string]::IsNullOrWhiteSpace($userEmailResult.Output)
) {
    throw @"
Git 提交身份尚未设置。请先执行：

git config --global user.name "你的 GitHub 用户名"
git config --global user.email "你的 GitHub 邮箱"
"@
}

$statusResult = Invoke-Native `
    -FilePath $gitPath `
    -Arguments @('status', '--porcelain') `
    -Quiet

if (-not [string]::IsNullOrWhiteSpace($statusResult.Output)) {
    Write-Host '提交 Beer Journal 1.0 源码和文档...'

    Invoke-Native -FilePath $gitPath -Arguments @('add', '-A') | Out-Null
    Invoke-Native -FilePath $gitPath -Arguments @(
        'commit',
        '-m',
        'feat: release Beer Journal 1.0'
    ) | Out-Null
}
else {
    Write-Host '工作区没有待提交修改，跳过重复提交。'
}

Write-Host ''
Write-Host '5. 建立正式 main 分支...'

# -C 会让 main 指向当前正式提交，同时保留原来的开发分支。
Invoke-Native -FilePath $gitPath -Arguments @('switch', '-C', 'main') | Out-Null

$headResult = Invoke-Native `
    -FilePath $gitPath `
    -Arguments @('rev-parse', 'HEAD') `
    -Quiet

$headCommit = $headResult.Output.Trim()

Write-Host "正式提交：$headCommit"

Write-Host ''
Write-Host '6. 创建或连接 GitHub 仓库...'

$repoView = Invoke-Native `
    -FilePath $ghPath `
    -Arguments @('repo', 'view', $repo, '--json', 'nameWithOwner,url,visibility') `
    -AllowFailure `
    -Quiet

if (-not $repoView.Success) {
    Write-Host "GitHub 仓库不存在，正在创建：$repo"

    Invoke-Native -FilePath $ghPath -Arguments @(
        'repo',
        'create',
        $repo,
        '--public',
        '--description',
        'A private, local-first Android beer journal.'
    ) | Out-Null
}
else {
    Write-Host "GitHub 仓库已经存在：$repo"
    Write-Host $repoView.Output
}

# 用户明确要求仓库公开。
Invoke-Native -FilePath $ghPath -Arguments @(
    'repo',
    'edit',
    $repo,
    '--visibility',
    'public',
    '--accept-visibility-change-consequences'
) | Out-Null

$originResult = Invoke-Native `
    -FilePath $gitPath `
    -Arguments @('remote', 'get-url', 'origin') `
    -AllowFailure `
    -Quiet

if ($originResult.Success) {
    Invoke-Native -FilePath $gitPath -Arguments @(
        'remote',
        'set-url',
        'origin',
        $remoteUrl
    ) | Out-Null
}
else {
    Invoke-Native -FilePath $gitPath -Arguments @(
        'remote',
        'add',
        'origin',
        $remoteUrl
    ) | Out-Null
}

Write-Host ''
Write-Host '7. 创建正式版本标签...'

$localTagResult = Invoke-Native `
    -FilePath $gitPath `
    -Arguments @('rev-parse', '-q', '--verify', "refs/tags/$tag") `
    -AllowFailure `
    -Quiet

$remoteTagResult = Invoke-Native `
    -FilePath $gitPath `
    -Arguments @('ls-remote', '--tags', 'origin', "refs/tags/$tag") `
    -AllowFailure `
    -Quiet

if ($localTagResult.Success) {
    $localTagCommitResult = Invoke-Native `
        -FilePath $gitPath `
        -Arguments @('rev-list', '-n', '1', $tag) `
        -Quiet

    $localTagCommit = $localTagCommitResult.Output.Trim()

    if ($localTagCommit -ne $headCommit) {
        if (-not [string]::IsNullOrWhiteSpace($remoteTagResult.Output)) {
            throw "远程标签 $tag 已存在且不指向当前正式提交。为避免破坏已发布版本，脚本已停止。"
        }

        Write-Host "本地旧标签 $tag 尚未推送，正在重新创建。"
        Invoke-Native -FilePath $gitPath -Arguments @('tag', '-d', $tag) | Out-Null

        Invoke-Native -FilePath $gitPath -Arguments @(
            'tag',
            '-a',
            $tag,
            '-m',
            "Beer Journal 1.0`nFirst stable local-first Android release."
        ) | Out-Null
    }
    else {
        Write-Host "标签 $tag 已指向当前正式提交。"
    }
}
else {
    Invoke-Native -FilePath $gitPath -Arguments @(
        'tag',
        '-a',
        $tag,
        '-m',
        "Beer Journal 1.0`nFirst stable local-first Android release."
    ) | Out-Null
}

Write-Host ''
Write-Host '8. 推送 main 和 v1.0.0...'

Invoke-Native -FilePath $gitPath -Arguments @(
    'push',
    '-u',
    'origin',
    'main'
) | Out-Null

Invoke-Native -FilePath $gitPath -Arguments @(
    'push',
    'origin',
    $tag
) | Out-Null

Write-Host ''
Write-Host '9. 创建 GitHub Release...'

$releaseNotesPath = Join-Path $env:TEMP 'beer-journal-v1.0.0-release-notes.md'

$releaseNotes = @"
# Beer Journal 1.0

Beer Journal 的首个正式本地离线 Android 版本。

## 主要功能

- 啤酒资料管理
- 品饮记录管理
- 总体评分和个人笔记
- 自定义标签
- 国家、分类和风格
- 多照片保存
- 本地图片压缩
- 封面照片管理
- 搜索、筛选和排序
- 个人品饮统计
- 回收站和恢复
- JSON 数据备份与恢复
- 完全本地存储
- 无账号、无云同步、无广告和追踪

## 测试版数据迁移

测试版和正式版是两个独立应用：

- 测试版：com.mybeerjournal.app.v1test
- 正式版：com.mybeerjournal.app

请先在测试版中导出 JSON 备份，再安装正式版并导入数据。确认正式版数据正常前，请勿卸载测试版。

## 文件校验

APK SHA-256：

$actualHash

APK 签名证书 SHA-256：

2741cccb9f9a5aab91348abb0dd56e9f514fd226e8e4dda965248111ffac7580
"@

[System.IO.File]::WriteAllText(
    $releaseNotesPath,
    $releaseNotes,
    (New-Object System.Text.UTF8Encoding($false))
)

$existingRelease = Invoke-Native `
    -FilePath $ghPath `
    -Arguments @('release', 'view', $tag, '--repo', $repo) `
    -AllowFailure `
    -Quiet

if ($existingRelease.Success) {
    Write-Host "Release $tag 已存在，更新发布文件。"

    Invoke-Native -FilePath $ghPath -Arguments @(
        'release',
        'upload',
        $tag,
        $apkPath,
        $shaPath,
        '--repo',
        $repo,
        '--clobber'
    ) | Out-Null

    Invoke-Native -FilePath $ghPath -Arguments @(
        'release',
        'edit',
        $tag,
        '--repo',
        $repo,
        '--title',
        'Beer Journal 1.0',
        '--notes-file',
        $releaseNotesPath,
        '--latest'
    ) | Out-Null
}
else {
    Invoke-Native -FilePath $ghPath -Arguments @(
        'release',
        'create',
        $tag,
        $apkPath,
        $shaPath,
        '--repo',
        $repo,
        '--title',
        'Beer Journal 1.0',
        '--notes-file',
        $releaseNotesPath,
        '--latest'
    ) | Out-Null
}

Remove-Item -LiteralPath $releaseNotesPath -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '10. 配置 GitHub Pages...'

$pagesView = Invoke-Native `
    -FilePath $ghPath `
    -Arguments @('api', "repos/$repo/pages") `
    -AllowFailure `
    -Quiet

if ($pagesView.Success) {
    $pagesUpdate = Invoke-Native `
        -FilePath $ghPath `
        -Arguments @(
            'api',
            '--method',
            'PUT',
            "repos/$repo/pages",
            '-f',
            'source[branch]=main',
            '-f',
            'source[path]=/docs'
        ) `
        -AllowFailure

    if (-not $pagesUpdate.Success) {
        Write-Host 'Pages 已存在，但自动更新发布源失败。'
    }
}
else {
    $pagesCreate = Invoke-Native `
        -FilePath $ghPath `
        -Arguments @(
            'api',
            '--method',
            'POST',
            "repos/$repo/pages",
            '-f',
            'source[branch]=main',
            '-f',
            'source[path]=/docs'
        ) `
        -AllowFailure

    if (-not $pagesCreate.Success) {
        Write-Host ''
        Write-Host 'GitHub Pages 自动启用失败，请稍后手动设置：'
        Write-Host 'Settings -> Pages -> Deploy from a branch -> main -> /docs'
    }
}

Write-Host ''
Write-Host '11. 最终状态...'

Invoke-Native -FilePath $gitPath -Arguments @('status', '--short') | Out-Null

$repoUrlResult = Invoke-Native `
    -FilePath $ghPath `
    -Arguments @('repo', 'view', $repo, '--json', 'url', '--jq', '.url') `
    -Quiet

$releaseUrlResult = Invoke-Native `
    -FilePath $ghPath `
    -Arguments @('release', 'view', $tag, '--repo', $repo, '--json', 'url', '--jq', '.url') `
    -Quiet

Write-Host ''
Write-Host '=================================================='
Write-Host 'Beer Journal 1.0 发布完成'
Write-Host '=================================================='
Write-Host "仓库：$($repoUrlResult.Output.Trim())"
Write-Host "Release：$($releaseUrlResult.Output.Trim())"
Write-Host 'Pages：https://Eddie135.github.io/Beer-Journal/'
Write-Host "APK SHA-256：$actualHash"
Write-Host '=================================================='
