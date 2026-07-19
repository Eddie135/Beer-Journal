param(
    [string]$KeystorePath = "$env:USERPROFILE\Documents\BeerJournalBackups\beer-journal-release.keystore",
    [string]$Alias = 'beer-journal',
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$keytool = Get-Command keytool.exe -ErrorAction Stop
$parent = Split-Path -Parent $KeystorePath
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$offlineBackup = Join-Path $parent 'offline\beer-journal-release.keystore'
$propertiesPath = Join-Path $RepositoryRoot 'mobile\android\keystore.properties'
if (Test-Path -LiteralPath $KeystorePath) {
    throw "Refusing to overwrite existing keystore: $KeystorePath"
}
if (Test-Path -LiteralPath $offlineBackup) {
    throw "Refusing to overwrite existing offline backup: $offlineBackup"
}

$storePassword = Read-Host 'Enter a new release keystore password' -AsSecureString
$keyPassword = Read-Host 'Enter the key password (press Enter to reuse the keystore password)' -AsSecureString
$storeBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePassword)
$keyBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPassword)
try {
    $storePlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($storeBstr)
    $keyPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyBstr)
    if ([string]::IsNullOrEmpty($keyPlain)) { $keyPlain = $storePlain }
    & $keytool.Source -genkeypair -v -keystore $KeystorePath -alias $Alias -keyalg RSA -keysize 4096 -validity 10000 -storepass $storePlain -keypass $keyPlain -dname 'CN=Beer Journal, OU=Mobile, O=Beer Journal, C=CN' | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "keytool failed with exit code $LASTEXITCODE" }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $offlineBackup) | Out-Null
    Copy-Item -LiteralPath $KeystorePath -Destination $offlineBackup -Force

    $properties = @(
        "storeFile=$($KeystorePath.Replace('\','/'))",
        "storePassword=$storePlain",
        "keyAlias=$Alias",
        "keyPassword=$keyPlain"
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($propertiesPath, $properties, $utf8NoBom)
} finally {
    if ($storeBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($storeBstr) }
    if ($keyBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyBstr) }
}
Write-Host "Created release keystore: $KeystorePath"
Write-Host "Created offline backup: $offlineBackup"
Write-Host "Configured ignored signing properties: $propertiesPath"
Write-Host "Keystore SHA-256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $KeystorePath).Hash.ToLowerInvariant())"
Write-Host "Offline backup SHA-256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $offlineBackup).Hash.ToLowerInvariant())"
Write-Host 'The password was never written to source, logs, or Git.'
