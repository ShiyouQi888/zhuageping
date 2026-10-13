param(
    [Parameter(Mandatory = $true)][string]$PayloadPath,
    [string]$BuildLabel = '20261013',
    [string]$NsisPath = "$env:LOCALAPPDATA\electron-builder\Cache\nsis\nsis-3.0.4.1\makensis.exe"
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$payload = (Resolve-Path -LiteralPath $PayloadPath).Path
$metadata = Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
$version = $metadata.version
if ($BuildLabel -notmatch '^[0-9A-Za-z-]+$') { throw 'Invalid build label.' }
if (!(Test-Path -LiteralPath $NsisPath)) { throw "NSIS compiler missing: $NsisPath" }
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
& $NsisPath '/INPUTCHARSET' 'UTF8' "/DPAYLOAD=$payload" "/DINSTALLER_OUTPUT=$output" "/DAPP_VERSION=$version" "/DAPP_ICON=$(Join-Path $payload 'Assets\AppIcon.ico')" "/DFILE_MANIFEST=$manifest" "/DINSTALLED_KIB=$kib" (Join-Path $repo 'build\winui-installer.nsi')
if ($LASTEXITCODE -ne 0) { throw "NSIS failed: $LASTEXITCODE" }
$hash = Get-FileHash -LiteralPath $output -Algorithm SHA256
[IO.File]::WriteAllText("$output.sha256", "$($hash.Hash)  $([IO.Path]::GetFileName($output))`n", [Text.UTF8Encoding]::new($false))
Write-Output "Installer: $output"
Write-Output "Payload: $($files.Count) files; OCR models: $($models.Count)"
Write-Output "SHA256: $($hash.Hash)"
