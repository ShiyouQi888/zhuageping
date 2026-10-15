param(
    [Parameter(Mandatory = $true)][string]$PayloadPath,
    [string]$BuildLabel = '20261013',
    [string]$NsisPath,
    [string]$SigningCertificateThumbprint = $env:WIN_SIGNING_CERT_THUMBPRINT,
    [string]$SignToolPath
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$payload = (Resolve-Path -LiteralPath $PayloadPath).Path
$metadata = Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
$version = $metadata.version
if ($BuildLabel -notmatch '^[0-9A-Za-z-]+$') { throw 'Invalid build label.' }
if ([string]::IsNullOrWhiteSpace($NsisPath)) {
    $nsisCandidates = @((Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe'))
    $cachedNsis = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\nsis'
    if (Test-Path -LiteralPath $cachedNsis) {
        $nsisCandidates += Get-ChildItem -LiteralPath $cachedNsis -Directory |
            Sort-Object { if ($_.Name -match '(\d+(?:\.\d+)+)') { [version]$Matches[1] } else { [version]'0.0' } } -Descending |
            ForEach-Object { Join-Path $_.FullName 'makensis.exe' }
    }
    foreach ($candidate in $nsisCandidates) {
        if (!(Test-Path -LiteralPath $candidate)) { continue }
        $candidateVersionText = & $candidate /VERSION | Select-Object -First 1
        if ($candidateVersionText -match '(\d+\.\d+(?:\.\d+){0,2})' -and [version]$Matches[1] -ge [version]'3.8') {
            $NsisPath = $candidate
            break
        }
    }
}
if (!$NsisPath -or !(Test-Path -LiteralPath $NsisPath)) { throw 'NSIS 3.08 or later is required.' }
$SigningCertificateThumbprint = ($SigningCertificateThumbprint -replace '\s', '').ToUpperInvariant()
if ($SigningCertificateThumbprint -notmatch '^[A-F0-9]{40}$') {
    throw 'Set WIN_SIGNING_CERT_THUMBPRINT to a trusted Authenticode certificate installed in CurrentUser\My.'
}
$certificate = Get-ChildItem -LiteralPath "Cert:\CurrentUser\My\$SigningCertificateThumbprint" -ErrorAction SilentlyContinue
if (!$certificate -or !$certificate.HasPrivateKey) { throw 'The signing certificate or its private key is unavailable in CurrentUser\My.' }
$nsisVersionText = & $NsisPath /VERSION | Select-Object -First 1
if ($nsisVersionText -notmatch '(\d+\.\d+(?:\.\d+){0,2})') { throw "Unable to determine NSIS version: $nsisVersionText" }
$nsisVersion = [version]$Matches[1]
if ($nsisVersion -lt [version]'3.8') {
    throw 'NSIS 3.08 or later is required to sign the generated uninstaller.'
}
if ([string]::IsNullOrWhiteSpace($SignToolPath)) {
    $kitsPath = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    $SignToolPath = Get-ChildItem -LiteralPath $kitsPath -Directory -ErrorAction SilentlyContinue |
        Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
        ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
}
if (!$SignToolPath -or !(Test-Path -LiteralPath $SignToolPath)) { throw 'Windows SDK signtool.exe was not found.' }
$SignToolPath = (Resolve-Path -LiteralPath $SignToolPath).Path
$required = @(
    'Zhuageping.WinUI.exe', 'Zhuageping.WinUI.dll', 'App.xbf', 'MainPage.xbf', 'MainWindow.xbf',
    'resources.pri', 'Assets\AppIcon.ico', 'Microsoft.UI.Xaml.dll',
    'recorder\ZhuagepingRecorderHost.exe', 'recorder\ScreenRecorderLib.dll',
    'ocr\RapidOCR-json\RapidOCR_json.exe'
)
foreach ($relative in $required) {
    if (!(Test-Path -LiteralPath (Join-Path $payload $relative) -PathType Leaf)) { throw "Missing payload: $relative" }
}
$models = @(Get-ChildItem -LiteralPath (Join-Path $payload 'ocr\RapidOCR-json') -Recurse -Filter '*.onnx')
if ($models.Count -lt 3) { throw 'OCR detection, classification and recognition models are required.' }
$files = @(Get-ChildItem -LiteralPath $payload -Recurse -File)
$peFiles = @($files | Where-Object { $_.Extension -in @('.exe', '.dll') })
foreach ($file in $peFiles) {
    $existingSignature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($existingSignature.Status -eq 'Valid') { continue }
    if ($existingSignature.Status -ne 'NotSigned') {
        throw "Refusing to overwrite an invalid existing signature ($($existingSignature.Status)): $($file.FullName)"
    }
    & $SignToolPath sign /sha1 $SigningCertificateThumbprint /fd SHA256 /tr https://timestamp.digicert.com /td SHA256 $file.FullName
    if ($LASTEXITCODE -ne 0) { throw "Failed to sign payload binary: $($file.FullName)" }
    & $SignToolPath verify /pa /all $file.FullName
    if ($LASTEXITCODE -ne 0) { throw "Authenticode verification failed: $($file.FullName)" }
}
$manifestDir = Join-Path $repo ".runtime\native-installer-$BuildLabel"
New-Item -ItemType Directory -Path $manifestDir -Force | Out-Null
$manifest = Join-Path $manifestDir 'uninstall-files.nsh'
function Escape-Nsis([string]$value) { return $value.Replace('$', '$$').Replace('"', '$\"') }
$lines = @()
foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath($payload, $file.FullName)
    $lines += 'Delete "$INSTDIR\' + (Escape-Nsis $relative) + '"'
}
foreach ($dir in (Get-ChildItem -LiteralPath $payload -Recurse -Directory | Sort-Object { $_.FullName.Length } -Descending)) {
    $relative = [IO.Path]::GetRelativePath($payload, $dir.FullName)
    $lines += 'RMDir "$INSTDIR\' + (Escape-Nsis $relative) + '"'
}
[IO.File]::WriteAllLines($manifest, $lines, [Text.UTF8Encoding]::new($true))
$output = Join-Path $repo "release\zhuageping-winui-Setup-$version-preview-$BuildLabel-x64.exe"
$kib = [int][Math]::Ceiling(($files | Measure-Object Length -Sum).Sum / 1024)
& $NsisPath '/INPUTCHARSET' 'UTF8' "/DPAYLOAD=$payload" "/DINSTALLER_OUTPUT=$output" "/DAPP_VERSION=$version" "/DAPP_ICON=$(Join-Path $payload 'Assets\AppIcon.ico')" "/DINSTALLER_HEADER=$(Join-Path $repo 'build\winui-installer-header.bmp')" "/DINSTALLER_SIDEBAR=$(Join-Path $repo 'build\winui-installer-sidebar.bmp')" "/DFILE_MANIFEST=$manifest" "/DINSTALLED_KIB=$kib" "/DSIGNTOOL=$SignToolPath" "/DSIGN_CERT_THUMBPRINT=$SigningCertificateThumbprint" (Join-Path $repo 'build\winui-installer.nsi')
if ($LASTEXITCODE -ne 0) { throw "NSIS failed: $LASTEXITCODE" }
$installerSignature = Get-AuthenticodeSignature -LiteralPath $output
if ($installerSignature.Status -ne 'Valid') { throw "Installer signature verification failed: $($installerSignature.Status)" }
$hash = Get-FileHash -LiteralPath $output -Algorithm SHA256
[IO.File]::WriteAllText("$output.sha256", "$($hash.Hash)  $([IO.Path]::GetFileName($output))`n", [Text.UTF8Encoding]::new($false))
Write-Output "Installer: $output"
Write-Output "Payload: $($files.Count) files; OCR models: $($models.Count)"
Write-Output "SHA256: $($hash.Hash)"
