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
            $detail = (([string]$stderr).Trim() + ' ' + ([string]$stdout).Trim()).Trim()
            $detail = $detail -replace '(?i)(token\s*:\s*)\S+', '$1[redacted]'
            $detail = $detail -replace '(?i)\b(gh[pousr]_[A-Za-z0-9_\-]+)\b', '[redacted-token]'
            if ($detail.Length -gt 1000) { $detail = $detail.Substring(0, 1000) + '...' }
            if ($detail) {
                throw "$FilePath failed with exit code ${exitCode}: $detail"
            }
            throw "$FilePath failed with exit code $exitCode."
        }
        return [pscustomobject]@{ ExitCode = $exitCode; StdOut = ([string]$stdout).Trim(); StdErr = ([string]$stderr).Trim() }
    } finally {
        Remove-Item $outPath, $errPath -Force -ErrorAction SilentlyContinue
    }
}

function Git-Output { param([string[]]$Arguments) (Invoke-Captured -FilePath $gitPath -Arguments $Arguments -Quiet).StdOut }
function Gh-Output { param([string[]]$Arguments) (Invoke-Captured -FilePath $ghPath -Arguments $Arguments -Quiet).StdOut }
function GetRemoteMain {
    $lastError = ''
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $result = Invoke-Captured -FilePath $gitPath -Arguments @('-c', 'http.version=HTTP/1.1', 'ls-remote', 'origin', 'refs/heads/main') -AllowFailure -Quiet
        if ($result.ExitCode -eq 0) {
            if ([string]::IsNullOrWhiteSpace($result.StdOut)) { return '' }
            return (($result.StdOut -split '\s+')[0]).Trim()
        }
        $lastError = "$($result.StdOut) $($result.StdErr)"
        if ($attempt -lt 3 -and $lastError -match '(?i)curl 55|connection reset|failed to connect|could not connect|timed out|connection timed out') {
            Start-Sleep -Seconds 2
        } else {
            break
        }
    }

    $api = Invoke-Captured -FilePath $ghPath -Arguments @('api', "repos/$fullRepo/git/ref/heads/main", '--jq', '.object.sha') -AllowFailure -Quiet
    if ($api.ExitCode -eq 0 -and $api.StdOut -match '^[0-9a-f]{40}$') { return $api.StdOut.Trim() }
    if (($api.StdOut + $api.StdErr) -match '(?i)not found|404') { return '' }
    throw "Unable to query origin/main: $lastError"
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
    $allowedResumeChanges = @(
        'scripts/resume-publish-v1.ps1',
        'docs/index.html',
        'docs/styles.css',
        'docs/script.js',
        'README.md',
        'docs/ROADMAP.md',
        'docs/RELEASE_NOTES_ZH.md'
    )
    $dirtyPaths = @($status -split "`r?`n" | Where-Object { $_ } | ForEach-Object {
        ($_ -replace '^[ MADRCU?!]{1,2}\s+', '')
    })
    $unexpectedDirty = @($dirtyPaths | Where-Object {
        ($_ -notin $allowedResumeChanges) -and ($_ -notmatch '^scripts/publish-v1\.ps1\.broken-')
    })
    if ($unexpectedDirty.Count) { throw "Unexpected uncommitted files exist: $($unexpectedDirty -join ', ')" }
    if (-not [string]::IsNullOrWhiteSpace($status) -and $headSubjectBeforeCommit -eq 'feat: release Beer Journal 1.0' -and ($dirtyPaths | Where-Object { $_ -in $allowedResumeChanges })) {
        Invoke-Captured -FilePath $gitPath -Arguments @('add', '--', $allowedResumeChanges) | Out-Null
        $pageCommitMessage = Join-Path $env:TEMP 'beer-journal-pages-commit.txt'
        $tempFiles += $pageCommitMessage
        [IO.File]::WriteAllText($pageCommitMessage, "docs: redesign Chinese product and release pages`r`n", (New-Object Text.UTF8Encoding($false)))
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
    $repoDescription = 'Beer Journal: a fully offline Android beer journal for local Beer, Tasting, photo, tag, and statistics records.'
    $repoHomepage = 'https://' + $Owner + '.github.io/' + $Repository + '/'
    $repoEditArgs = @('repo', 'edit', $fullRepo, '--description', $repoDescription, '--homepage', $repoHomepage, '--add-topic', 'android', '--add-topic', 'beer', '--add-topic', 'beer-journal', '--add-topic', 'offline-first', '--add-topic', 'local-first', '--add-topic', 'sqlite', '--add-topic', 'capacitor', '--add-topic', 'personal-journal', '--add-topic', 'chinese')
    Invoke-Captured -FilePath $ghPath -Arguments $repoEditArgs -AllowFailure | Out-Null
    $origin = Invoke-Captured -FilePath $gitPath -Arguments @('remote', 'get-url', 'origin') -AllowFailure -Quiet
    if ($origin.ExitCode -ne 0) { Invoke-Captured -FilePath $gitPath -Arguments @('remote', 'add', 'origin', $remoteUrl) | Out-Null }
    elseif ($origin.StdOut.Trim() -ne $remoteUrl) { Invoke-Captured -FilePath $gitPath -Arguments @('remote', 'set-url', 'origin', $remoteUrl) | Out-Null }

    $remoteMain = GetRemoteMain
    if ($remoteMain -eq $localMain) {
        Write-Host 'Remote main already matches local main; skipping object upload.'
    } else {
        if ($remoteMain) {
            Invoke-Captured -FilePath $gitPath -Arguments @('fetch', 'origin', 'main', '--no-tags') | Out-Null
            Write-Host ('Remote main: ' + $remoteMain)
            Write-Host ('Local main:  ' + $localMain)
            if (-not (Is-Ancestor $remoteMain $localMain)) { throw 'Remote main contains unknown commits; refusing to overwrite it.' }
        }
        [void](Invoke-Captured -FilePath $gitPath -Arguments @('config', 'http.version', 'HTTP/1.1'))
        $pushed = $false
        for ($attempt = 1; $attempt -le 3 -and -not $pushed; $attempt++) {
            $beforePush = GetRemoteMain
            if ($beforePush -eq $localMain) { $pushed = $true; break }
            if ($beforePush -and -not (Is-Ancestor $beforePush $localMain)) { throw 'Remote main changed and is not an ancestor; refusing a non-fast-forward overwrite.' }
            $push = Invoke-Captured -FilePath $gitPath -Arguments @('-c', 'http.version=HTTP/1.1', '-c', 'core.compression=0', '-c', 'http.lowSpeedLimit=1', '-c', 'http.lowSpeedTime=120', 'push', '--no-thin', '--set-upstream', 'origin', 'main') -AllowFailure
            if ($push.ExitCode -eq 0) { $pushed = $true; break }
            $afterPush = GetRemoteMain
            if ($afterPush -eq $localMain) { $pushed = $true; break }
            if (($push.StdOut + $push.StdErr) -notmatch '(?i)curl 55|connection reset|unexpected disconnect|RPC failed') { throw 'git push failed for a non-transient reason.' }
            if ($attempt -lt 3) { Start-Sleep -Seconds 2 }
        }
        if (-not $pushed) {
            for ($verify = 1; $verify -le 3 -and -not $pushed; $verify++) {
                Start-Sleep -Seconds 5
                $confirmedRemote = GetRemoteMain
                if ($confirmedRemote -eq $localMain) { $pushed = $true; break }
            }
        }
        if (-not $pushed) {
            throw ('main push did not complete after three safe retries. Last Git output: ' + $push.StdOut + ' ' + $push.StdErr)
        }
    }
    if ((GetRemoteMain) -ne $localMain) { throw 'Remote main does not match local main after publish.' }

    $localTag = (Git-Output @('rev-list', '-n', '1', $tag)).Trim()
    $tagSubject = (Git-Output @('show', '-s', '--format=%s', $localTag)).Trim()
    if ($tagSubject -ne 'feat: release Beer Journal 1.0') { throw ($tag + ' does not point to the formal release commit.') }
    $remoteTagRef = 'refs/tags/' + $tag + '^{}'
    $remoteTagResult = Invoke-Captured -FilePath $gitPath -Arguments @('ls-remote', 'origin', $remoteTagRef) -AllowFailure -Quiet
    if ($remoteTagResult.ExitCode -eq 0 -and $remoteTagResult.StdOut) {
        $remoteTag = ($remoteTagResult.StdOut -split '\s+')[0]
        if ($remoteTag -ne $localTag) { throw ('Remote ' + $tag + ' points to a different commit.') }
    } else {
        Invoke-Captured -FilePath $gitPath -Arguments @('push', 'origin', $tag) | Out-Null
    }

    $releaseNotes = Join-Path $env:TEMP 'beer-journal-v1-release-notes.md'
    $tempFiles += $releaseNotes
    $releaseNotesSource = Join-Path $repoRoot 'docs\RELEASE_NOTES_ZH.md'
    if (-not (Test-Path -LiteralPath $releaseNotesSource)) { throw 'Chinese release notes source is missing.' }
    $releaseNotesContent = Get-Content -LiteralPath $releaseNotesSource -Raw -Encoding UTF8
    Set-Content -LiteralPath $releaseNotes -Value $releaseNotesContent -Encoding UTF8
    $releaseTitle = 'Beer Journal 1.0'
    $releaseProbe = Invoke-Captured -FilePath $ghPath -Arguments @('release', 'view', $tag, '--repo', $fullRepo) -AllowFailure -Quiet
    if ($releaseProbe.ExitCode -eq 0) {
        Invoke-Captured -FilePath $ghPath -Arguments @('release', 'upload', $tag, $apkPath, $shaPath, '--repo', $fullRepo, '--clobber') | Out-Null
        Invoke-Captured -FilePath $ghPath -Arguments @('release', 'edit', $tag, '--repo', $fullRepo, '--title', $releaseTitle, '--notes-file', $releaseNotes, '--latest') | Out-Null
    } else {
        Invoke-Captured -FilePath $ghPath -Arguments @('release', 'create', $tag, $apkPath, $shaPath, '--repo', $fullRepo, '--title', $releaseTitle, '--notes-file', $releaseNotes, '--latest') | Out-Null
    }

    $pagesBody = Join-Path $env:TEMP 'beer-journal-pages.json'
    $tempFiles += $pagesBody
    $pagesJson = @{ source = @{ branch = 'main'; path = '/docs' } } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($pagesBody, $pagesJson, (New-Object Text.UTF8Encoding($false)))
    $pagesApiPath = 'repos/' + $fullRepo + '/pages'
    $pages = Invoke-Captured -FilePath $ghPath -Arguments @('api', $pagesApiPath) -AllowFailure -Quiet
    if ($pages.ExitCode -eq 0) {
        $pagesUpdate = Invoke-Captured -FilePath $ghPath -Arguments @('api', '--method', 'PUT', $pagesApiPath, '--input', $pagesBody) -AllowFailure
        if ($pagesUpdate.ExitCode -ne 0) { Write-Warning 'Pages source could not be updated. Use Settings -> Pages -> Deploy from a branch -> main -> /docs.' }
    } else {
        $pagesCreate = Invoke-Captured -FilePath $ghPath -Arguments @('api', '--method', 'POST', $pagesApiPath, '--input', $pagesBody) -AllowFailure
        if ($pagesCreate.ExitCode -ne 0) { Write-Warning 'Pages API setup failed. Use Settings -> Pages -> Deploy from a branch -> main -> /docs.' }
    }

    $finalStatus = Git-Output @('status', '--short')
    Write-Host ('Local main: ' + $localMain)
    $remoteMainFinal = GetRemoteMain
    Write-Host ('Remote main: ' + $remoteMainFinal)
    Write-Host ('v1.0.0 tag commit: ' + $localTag)
    Write-Host ('Repository: https://github.com/' + $fullRepo)
    Write-Host ('Release: https://github.com/' + $fullRepo + '/releases/tag/' + $tag)
    Write-Host ('Pages: ' + $repoHomepage + ' (or configure main /docs if not enabled)')
    Write-Host ('APK SHA-256: ' + $apkHash)
    Write-Host ('Git status: ' + $finalStatus)
} finally {
    foreach ($file in $tempFiles) { Remove-Item $file -Force -ErrorAction SilentlyContinue }
    Pop-Location
}
