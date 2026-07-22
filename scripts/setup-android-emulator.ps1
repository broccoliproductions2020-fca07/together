$ErrorActionPreference = 'Stop'

$installRoot = 'D:\Dokumente\AndroidDev'
$javaRoot = Join-Path $installRoot 'Java'
$androidRoot = Join-Path $installRoot 'Android'
$sdkRoot = Join-Path $androidRoot 'Sdk'
$avdRoot = Join-Path $androidRoot 'avd'
$downloadsRoot = Join-Path $androidRoot 'downloads'
$cmdlineZip = Join-Path $downloadsRoot 'commandlinetools-win.zip'
$jdkZip = Join-Path $downloadsRoot 'temurin-jdk21.zip'
$cmdlineUrl = 'https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip'
$jdkUrl = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk'
$avdName = 'Together_Pixel_7'
$systemImage = 'system-images;android-35;google_apis_playstore;x86_64'

function Ensure-Directory($Path) {
  if (!(Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Download-IfMissing($Url, $OutFile) {
  if (Test-Path -LiteralPath $OutFile) {
    Write-Host "Already downloaded: $OutFile"
    return
  }

  Write-Host "Downloading: $Url"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile
}

function Add-UserPath($PathToAdd) {
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @()
  if ($current) {
    $parts = $current -split ';' | Where-Object { $_ -and $_.Trim() }
  }

  if ($parts -notcontains $PathToAdd) {
    $next = ($parts + $PathToAdd) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $next, 'User')
  }
}

Ensure-Directory $javaRoot
Ensure-Directory $androidRoot
Ensure-Directory $sdkRoot
Ensure-Directory $avdRoot
Ensure-Directory $downloadsRoot

Download-IfMissing $jdkUrl $jdkZip
Download-IfMissing $cmdlineUrl $cmdlineZip

$jdkHome = Get-ChildItem -LiteralPath $javaRoot -Directory -Filter 'jdk-*' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (!$jdkHome) {
  Write-Host "Extracting JDK to $javaRoot"
  Expand-Archive -LiteralPath $jdkZip -DestinationPath $javaRoot -Force
  $jdkHome = Get-ChildItem -LiteralPath $javaRoot -Directory -Filter 'jdk-*' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

if (!$jdkHome) {
  throw 'Could not find extracted JDK directory.'
}

$cmdlineLatest = Join-Path $sdkRoot 'cmdline-tools\latest'
$sdkManager = Join-Path $cmdlineLatest 'bin\sdkmanager.bat'
$avdManager = Join-Path $cmdlineLatest 'bin\avdmanager.bat'

if (!(Test-Path -LiteralPath $sdkManager)) {
  $tempTools = Join-Path $downloadsRoot 'cmdline-tools-extract'
  if (Test-Path -LiteralPath $tempTools) {
    Remove-Item -LiteralPath $tempTools -Recurse -Force
  }
  Ensure-Directory $tempTools
  Write-Host "Extracting Android command line tools"
  Expand-Archive -LiteralPath $cmdlineZip -DestinationPath $tempTools -Force
  Ensure-Directory (Split-Path $cmdlineLatest -Parent)
  if (Test-Path -LiteralPath $cmdlineLatest) {
    Remove-Item -LiteralPath $cmdlineLatest -Recurse -Force
  }
  Move-Item -LiteralPath (Join-Path $tempTools 'cmdline-tools') -Destination $cmdlineLatest
}

$env:JAVA_HOME = $jdkHome.FullName
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_AVD_HOME = $avdRoot
$env:Path = "$($jdkHome.FullName)\bin;$sdkRoot\platform-tools;$sdkRoot\emulator;$cmdlineLatest\bin;$env:Path"

Write-Host "Accepting Android SDK licenses"
$yesToAll = ((1..80 | ForEach-Object { 'y' }) -join [Environment]::NewLine)
$yesToAll | & $sdkManager --sdk_root=$sdkRoot --licenses

Write-Host "Installing Android SDK packages to $sdkRoot"
$yesToAll | & $sdkManager --sdk_root=$sdkRoot `
  'platform-tools' `
  'emulator' `
  'platforms;android-35' `
  $systemImage

$existingAvds = & $avdManager list avd
if ($existingAvds -notmatch [regex]::Escape("Name: $avdName")) {
  Write-Host "Creating Android virtual device: $avdName"
  'no' | & $avdManager create avd --force --name $avdName --package $systemImage --device 'pixel_7'
}
else {
  Write-Host "AVD already exists: $avdName"
}

[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkHome.FullName, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkRoot, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdkRoot, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_AVD_HOME', $avdRoot, 'User')
Add-UserPath "$($jdkHome.FullName)\bin"
Add-UserPath "$sdkRoot\platform-tools"
Add-UserPath "$sdkRoot\emulator"
Add-UserPath "$cmdlineLatest\bin"

Write-Host ''
Write-Host 'Android setup complete.'
Write-Host "JAVA_HOME=$($jdkHome.FullName)"
Write-Host "ANDROID_HOME=$sdkRoot"
Write-Host "ANDROID_AVD_HOME=$avdRoot"
Write-Host "AVD=$avdName"
Write-Host ''
Write-Host 'Open a new terminal after this setup so the updated PATH is available.'
