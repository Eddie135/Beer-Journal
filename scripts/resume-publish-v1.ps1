param(
    [string]$Owner = 'Eddie135',
    [string]$Repository = 'Beer-Journal'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$fullRepo = "$Owner/$Repository"
$remoteUrl = "https://github.com/$fullRepo.git"
$tag = 'v1.0.0'
$apkPath = Join-Path $repoRoot 'mobile\android\app\build\outputs\apk\release\Beer-Journal-v1.0.0-release.apk'
$shaPath = Join-Path $repoRoot 'mobile\android\app\build\outputs\apk\release\Beer-Journal-v1.0.0-SHA256.txt'
$gitPath = (Get-Command git.exe -ErrorAction Stop).Source
$ghCommand = Get-Command gh.exe -ErrorAction SilentlyContinue
$ghPath = if ($ghCommand) { $ghCommand.Source } else { 'C:\Program Files\GitHub CLI\gh.exe' }
if (-not (Test-Path -LiteralPath $ghPath)) { throw 'gh.exe was not found.' }

function Invoke-Captured {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowFailure,
        [switch]$Quiet
    )
    $id = [Guid]::NewGuid().ToString('N')
    $outPath = Join-Path $env:TEMP "beer-journal-resume-$id.out"
    $errPath = Join-Path $env:TEMP "beer-journal-resume-$id.err"
    try {
        $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $repoRoot -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outPath -RedirectStandardError $errPath
        $stdout = if (Test-Path $outPath) { Get-Content $outPath -Raw } else { '' }
        $stderr = if (Test-Path $errPath) { Get-Content $errPath -Raw } else { '' }
        if (-not $Quiet) {
            if ($stdout) { Write-Host $stdout.TrimEnd() }
            if ($stderr) { Write-Host $stderr.TrimEnd() }
        }
        if ($null -eq $stdout) { $stdout = '' }
        if ($null -eq $stderr) { $stderr = '' }
        $exitCode = if ($null -eq $process) { 1 } else { [int]$process.ExitCode }
        if (-not $AllowFailure -and $exitCode -ne 0) {
            throw "$FilePath failed with exit code $exitCode."
        }
        return [pscustomobject]@{ ExitCode = $exitCode; StdOut = ([string]$stdout).Trim(); StdErr = ([string]$stderr).Trim() }
    } finally {
        Remove-Item $outPath, $errPath -Force -ErrorAction SilentlyContinue
    }
}

function Git-Output { param([string[]]$Arguments) (Invoke-Captured -FilePath $gitPath -Arguments $Arguments -Quiet).StdOut }
function Gh-Output { param([string[]]$Arguments) (Invoke-Captured -FilePath $ghPath -Arguments $Arguments -Quiet).StdOut }
function Remote-Main { 
    $result = Invoke-Captured -FilePath $gitPath -Arguments @('ls-remote', 'origin', 'refs/heads/main') -AllowFailure -Quiet
    if ($result.ExitCode -ne 0) { throw "Unable to query origin/main: $($result.StdErr)" }
    if ([string]::IsNullOrWhiteSpace($result.StdOut)) { return '' }
    return (($result.StdOut -split '\s+')[0]).Trim()
}
function Is-Ancestor([string]$Older, [string]$Newer) {
    $result = Invoke-Captured -FilePath $gitPath -Arguments @('merge-base', '--is-ancestor', $Older, $Newer) -AllowFailure -Quiet
    return $result.ExitCode -eq 0
}

Push-Location $repoRoot
$tempFiles = @()
try {
    Write-Host 'Checking GitHub authentication without requesting a token...'
    Invoke-Captured -FilePath $ghPath -Arguments @('auth', 'status') -Quiet | Out-Null
    Invoke-Captured -FilePath $ghPath -Arguments @('auth', 'setup-git') -Quiet | Out-Null

    if (-not (Test-Path $apkPath)) { throw "Release APK not found: $apkPath" }
    if (-not (Test-Path $shaPath)) { throw "Release SHA-256 file not found: $shaPath" }
    $apkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $apkPath).Hash.ToLowerInvariant()
    $shaLine = Get-Content $shaPath | Where-Object { $_.Trim() } | Select-Object -First 1
    $recordedHash = (($shaLine -split '\s+')[0]).ToLowerInvariant()
    if ($apkHash -ne $recordedHash) { throw "APK SHA-256 file does not match the APK." }
    Write-Host "APK SHA-256 verified: $apkHash"

    Invoke-Captured -FilePath $gitPath -Arguments @('diff', '--check') | Out-Null
    $tracked = @(Git-Output @('ls-files') -split "`r?`n" | Where-Object { $_ })
    $risk = '(^|/)(keystore\.properties|local\.properties|.*\.(keystore|jks|p12|pfx|apk|aab|db|sqlite|sqlite3))$|(^|/)(build|dist|node_modules|media|logs?)(/|$)|(^|/).*(backup|screenshot|logcat|test-photo).*\.(json|jpg|jpeg|png|txt)$'
    $riskyTracked = @($tracked | Where-Object { $_ -match $risk })
    if ($riskyTracked.Count) { throw "Sensitive/generated files are tracked: $($riskyTracked -join ', ')" }
    $checkpoint = Invoke-Captured -FilePath $gitPath -Arguments @('show-ref', '--verify', '--quiet', 'refs/tags/local-first-rc1-checkpoint') -AllowFailure -Quiet
    if ($checkpoint.ExitCode -ne 0) { throw 'local-first-rc1-checkpoint is missing.' }
    $docsIndex = Join-Path $repoRoot 'docs\index.html'
    if (Test-Path $docsIndex) {
        $html = Get-Content $docsIndex -Raw
        $html = $html.Replace('https://github.com/OWNER/beer-journal', "https://github.com/$fullRepo")
        [IO.File]::WriteAllText($docsIndex, $html, (New-Object Text.UTF8Encoding($false)))
    }

    $status = Git-Output @('status', '--porcelain')
    $headSubjectBeforeCommit = (Git-Output @('log', '-1', '--format=%s')).Trim()
    $allowedResumeChanges = @('scripts/resume-publish-v1.ps1', 'docs/index.html')
    $dirtyPaths = @($status -split "`r?`n" | Where-Object { $_ } | ForEach-Object {
        ($_ -replace '^[ MADRCU?!]{1,2}\s+', '')
    })
    $unexpectedDirty = @($dirtyPaths | Where-Object {
        ($_ -notin $allowedResumeChanges) -and ($_ -notmatch '^scripts/publish-v1\.ps1\.broken-')
    })
    if ($unexpectedDirty.Count) { throw "Unexpected uncommitted files exist: $($unexpectedDirty -join ', ')" }
    if (-not [string]::IsNullOrWhiteSpace($status) -and $headSubjectBeforeCommit -eq 'feat: release Beer Journal 1.0' -and ($dirtyPaths -contains 'docs/index.html')) {
        Invoke-Captured -FilePath $gitPath -Arguments @('add', '--', 'docs/index.html') | Out-Null
        $pageCommitMessage = Join-Path $env:TEMP 'beer-journal-pages-commit.txt'
        $tempFiles += $pageCommitMessage
        [IO.File]::WriteAllText($pageCommitMessage, "docs: link GitHub Pages to Beer Journal 1.0`r`n", (New-Object Text.UTF8Encoding($false)))
        Invoke-Captured -FilePath $gitPath -Arguments @('commit', '-F', $pageCommitMessage) | Out-Null
    } elseif (-not [string]::IsNullOrWhiteSpace($status) -and $headSubjectBeforeCommit -ne 'feat: release Beer Journal 1.0') {
        Invoke-Captured -FilePath $gitPath -Arguments @('add', '-A') | Out-Null
        $staged = @(Git-Output @('diff', '--cached', '--name-only') -split "`r?`n" | Where-Object { $_ })
        $badStaged = @($staged | Where-Object { $_ -match $risk })
        if ($badStaged.Count) { throw "Sensitive/generated files would be committed: $($badStaged -join ', ')" }
        $messagePath = Join-Path $env:TEMP 'beer-journal-resume-commit.txt'
        $tempFiles += $messagePath
        [IO.File]::WriteAllText($messagePath, "feat: release Beer Journal 1.0`r`n", (New-Object Text.UTF8Encoding($false)))
        Invoke-Captured -FilePath $gitPath -Arguments @('commit', '-F', $messagePath) | Out-Null
    } elseif (-not [string]::IsNullOrWhiteSpace($status)) {
        Write-Host 'Formal release commit already exists; leaving the local resume script and its backup uncommitted.'
    }

    $currentBranch = (Git-Output @('branch', '--show-current')).Trim()
    if ($currentBranch -ne 'main') { Invoke-Captured -FilePath $gitPath -Arguments @('switch', 'main') | Out-Null }
    $localMain = (Git-Output @('rev-parse', 'HEAD')).Trim()
    $subject = (Git-Output @('log', '-1', '--format=%s')).Trim()
    if ($subject -ne 'feat: release Beer Journal 1.0') {
        $existingReleaseCommit = (Git-Output @('rev-list', '-n', '1', $tag)).Trim()
        $existingReleaseSubject = (Git-Output @('show', '-s', '--format=%s', $existingReleaseCommit)).Trim()
        if ($existingReleaseSubject -ne 'feat: release Beer Journal 1.0') { throw 'HEAD/tag is not the formal Beer Journal 1.0 release.' }
    }

    $repoProbe = Invoke-Captured -FilePath $ghPath -Arguments @('repo', 'view', $fullRepo) -AllowFailure
    if ($repoProbe.ExitCode -ne 0) { throw "GitHub repository $fullRepo does not exist; refusing to create a different repository." }
    $origin = Invoke-Captured -FilePath $gitPath -Arguments @('remote', 'get-url', 'origin') -AllowFailure -Quiet
    if ($origin.ExitCode -ne 0) { Invoke-Captured -FilePath $gitPath -Arguments @('remote', 'add', 'origin', $remoteUrl) | Out-Null }
    elseif ($origin.StdOut.Trim() -ne $remoteUrl) { Invoke-Captured -FilePath $gitPath -Arguments @('remote', 'set-url', 'origin', $remoteUrl) | Out-Null }

    $remoteMain = Remote-Main
    if ($remoteMain -eq $localMain) {
        Write-Host 'Remote main already matches local main; skipping object upload.'
    } else {
        if ($remoteMain) {
            Invoke-Captured -FilePath $gitPath -Arguments @('fetch', 'origin', 'main', '--no-tags') | Out-Null
            Write-Host "Remote main: $remoteMain"
            Write-Host "Local main:  $localMain"
            if (-not (Is-Ancestor $remoteMain $localMain)) { throw 'Remote main contains unknown commits; refusing to overwrite it.' }
        }
        [void](Invoke-Captured -FilePath $gitPath -Arguments @('config', 'http.version', 'HTTP/1.1'))
        $pushed = $false
        for ($attempt = 1; $attempt -le 3 -and -not $pushed; $attempt++) {
            $beforePush = Remote-Main
            if ($beforePush -eq $localMain) { $pushed = $true; break }
            if ($beforePush -and -not (Is-Ancestor $beforePush $localMain)) { throw 'Remote main changed and is not an ancestor; refusing a non-fast-forward overwrite.' }
            $push = Invoke-Captured -FilePath $gitPath -Arguments @('-c', 'http.version=HTTP/1.1', '-c', 'core.compression=0', 'push', '--set-upstream', 'origin', 'main') -AllowFailure
            if ($push.ExitCode -eq 0) { $pushed = $true; break }
            $afterPush = Remote-Main
            if ($afterPush -eq $localMain) { $pushed = $true; break }
            if (($push.StdOut + $push.StdErr) -notmatch '(?i)curl 55|connection reset|unexpected disconnect|RPC failed') { throw 'git push failed for a non-transient reason.' }
            if ($attempt -lt 3) { Start-Sleep -Seconds 2 }
        }
        if (-not $pushed) {
            throw "main push did not complete after three safe retries. Last Git output: $($push.StdOut) $($push.StdErr)"
        }
    }
    if ((Remote-Main) -ne $localMain) { throw 'Remote main does not match local main after publish.' }

    $localTag = (Git-Output @('rev-list', '-n', '1', $tag)).Trim()
    $tagSubject = (Git-Output @('show', '-s', '--format=%s', $localTag)).Trim()
    if ($tagSubject -ne 'feat: release Beer Journal 1.0') { throw "$tag does not point to the formal release commit." }
    $remoteTagResult = Invoke-Captured -FilePath $gitPath -Arguments @('ls-remote', 'origin', "refs/tags/$tag^{}") -AllowFailure -Quiet
    if ($remoteTagResult.ExitCode -eq 0 -and $remoteTagResult.StdOut) {
        $remoteTag = ($remoteTagResult.StdOut -split '\s+')[0]
        if ($remoteTag -ne $localTag) { throw "Remote $tag points to a different commit." }
    } else {
        Invoke-Captured -FilePath $gitPath -Arguments @('push', 'origin', $tag) | Out-Null
    }

    $releaseNotes = Join-Path $env:TEMP 'beer-journal-v1-release-notes.md'
    $tempFiles += $releaseNotes
    $releaseNotesContent = @'
# Beer Journal 1.0

首个稳定的本地离线 Android 版本，包含 Beer 与 Tasting 管理、多照片与本地压缩、标签、国家、分类、评分、搜索、筛选、排序、统计、回收站和 JSON 备份恢复。

数据完全存储在手机本地，当前没有账号或云同步。`com.mybeerjournal.app.v1test` 与 `com.mybeerjournal.app` 是两个独立应用；请先从测试版导出 JSON，再在正式版导入。
'@ | Set-Content -LiteralPath $releaseNotes -Encoding UTF8
'@
    $releaseNotesContent = "Beer Journal 1.0`r`n`r`nFirst stable local-first Android release. Beer and Tasting management, local photos and compression, tags, countries, categories, ratings, search, filters, sorting, statistics, trash recovery, and JSON backup/restore.`r`n`r`nData stays on the device. There is no account or cloud sync. The test package com.mybeerjournal.app.v1test and formal package com.mybeerjournal.app are separate apps; export JSON from the test app before importing it into the formal app."
    Set-Content -LiteralPath $releaseNotes -Value $releaseNotesContent -Encoding UTF8
    $releaseProbe = Invoke-Captured -FilePath $ghPath -Arguments @('release', 'view', $tag, '--repo', $fullRepo) -AllowFailure -Quiet
    if ($releaseProbe.ExitCode -eq 0) {
        Invoke-Captured -FilePath $ghPath -Arguments @('release', 'upload', $tag, $apkPath, $shaPath, '--repo', $fullRepo, '--clobber') | Out-Null
        Invoke-Captured -FilePath $ghPath -Arguments @('release', 'edit', $tag, '--repo', $fullRepo, '--title', '"Beer Journal 1.0"', '--notes-file', $releaseNotes, '--latest') | Out-Null
    } else {
        Invoke-Captured -FilePath $ghPath -Arguments @('release', 'create', $tag, $apkPath, $shaPath, '--repo', $fullRepo, '--title', '"Beer Journal 1.0"', '--notes-file', $releaseNotes, '--latest') | Out-Null
    }

    $pagesBody = Join-Path $env:TEMP 'beer-journal-pages.json'
    $tempFiles += $pagesBody
    [IO.File]::WriteAllText($pagesBody, '{"source":{"branch":"main","path":"/docs"}}', (New-Object Text.UTF8Encoding($false)))
    $pages = Invoke-Captured -FilePath $ghPath -Arguments @('api', "repos/$fullRepo/pages") -AllowFailure -Quiet
    if ($pages.ExitCode -eq 0) {
        $pagesUpdate = Invoke-Captured -FilePath $ghPath -Arguments @('api', '--method', 'PUT', "repos/$fullRepo/pages", '--input', $pagesBody) -AllowFailure
        if ($pagesUpdate.ExitCode -ne 0) { Write-Warning 'Pages source could not be updated. Use Settings -> Pages -> Deploy from a branch -> main -> /docs.' }
    } else {
        $pagesCreate = Invoke-Captured -FilePath $ghPath -Arguments @('api', '--method', 'POST', "repos/$fullRepo/pages", '--input', $pagesBody) -AllowFailure
        if ($pagesCreate.ExitCode -ne 0) { Write-Warning 'Pages API setup failed. Use Settings -> Pages -> Deploy from a branch -> main -> /docs.' }
    }

    $finalStatus = Git-Output @('status', '--short')
    Write-Host "Local main: $localMain"
    Write-Host "Remote main: $(Remote-Main)"
    Write-Host "v1.0.0 tag commit: $localTag"
    Write-Host "Repository: https://github.com/$fullRepo"
    Write-Host "Release: https://github.com/$fullRepo/releases/tag/$tag"
    Write-Host "Pages: https://$Owner.github.io/$Repository/ (or configure main /docs if not enabled)"
    Write-Host "APK SHA-256: $apkHash"
    Write-Host "Git status: $finalStatus"
} finally {
    foreach ($file in $tempFiles) { Remove-Item $file -Force -ErrorAction SilentlyContinue }
    Pop-Location
}
