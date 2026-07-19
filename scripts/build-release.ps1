$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root 'mobile'
$android = Join-Path $mobile 'android'
$hostProjectCache = 'C:\Users\EDY\.gradle\beerjournal-project-cache'
$projectCache = if (Test-Path -LiteralPath $hostProjectCache) { $hostProjectCache } else { Join-Path $root '.gradle-project-cache-v1' }
$keystoreProperties = Join-Path $android 'keystore.properties'
$apkName = 'Beer-Journal-v1.0.0-release.apk'
$apkPath = Join-Path $android "app\build\outputs\apk\release\$apkName"
$bundledGradle = 'C:\Users\EDY\.gradle\wrapper\dists\gradle-8.14.3-all\10utluxaxniiv4wxiphsi49nj\gradle-8.14.3\bin\gradle.bat'
$gradleCommand = if (Test-Path -LiteralPath $bundledGradle) { $bundledGradle } else { Join-Path $android 'gradlew.bat' }

if (!(Test-Path -LiteralPath $keystoreProperties)) {
    throw "Missing $keystoreProperties. Run scripts/create-release-keystore.ps1 to create the keystore and ignored signing properties."
}

Push-Location $mobile
try {
    & pnpm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Vite build failed with exit code $LASTEXITCODE" }
    & .\node_modules\.bin\cap.cmd sync android
    if ($LASTEXITCODE -ne 0) { throw "Capacitor sync failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }

Push-Location $android
try {
    & $gradleCommand --offline --project-cache-dir $projectCache clean assembleRelease '-Pv1Test=false' '-PversionCode=32' '-PversionName=1.0.0' "-PapkName=$apkName"
    if ($LASTEXITCODE -ne 0) { throw "Gradle release build failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }

$releaseOutputDir = Join-Path $android 'app\build\outputs\apk\release'
$gradleApk = Get-ChildItem -LiteralPath $releaseOutputDir -Filter '*.apk' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $gradleApk) {
    throw "Gradle completed but no release APK was found in $releaseOutputDir"
}
if ($gradleApk.FullName -ne $apkPath) {
    Copy-Item -LiteralPath $gradleApk.FullName -Destination $apkPath -Force
}

if (!(Test-Path -LiteralPath $apkPath)) { throw "Release APK was not created: $apkPath" }
$shaPath = Join-Path $android "app\build\outputs\apk\release\Beer-Journal-v1.0.0-SHA256.txt"
$apkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $apkPath).Hash.ToLowerInvariant()
Set-Content -LiteralPath $shaPath -Value "$apkHash  Beer-Journal-v1.0.0-release.apk" -Encoding ASCII
Write-Host "Release APK: $apkPath"
Write-Host "APK SHA-256: $apkHash"
Write-Host "SHA-256 manifest: $shaPath"
