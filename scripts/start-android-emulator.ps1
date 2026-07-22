$ErrorActionPreference = 'Stop'

$androidRoot = 'D:\Dokumente\AndroidDev\Android'
$sdkRoot = Join-Path $androidRoot 'Sdk'
$avdRoot = Join-Path $androidRoot 'avd'
$emulator = Join-Path $sdkRoot 'emulator\emulator.exe'
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$avdName = 'Together_Pixel_7'

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_AVD_HOME = $avdRoot

& $adb start-server | Out-Null
$devices = & $adb devices
if ($devices -match 'emulator-\d+\s+offline') {
  Write-Host 'Clearing stale offline emulator entries...'
  & $adb kill-server
  & $adb start-server | Out-Null
  $devices = & $adb devices
}

if ($devices -match 'emulator-\d+\s+device') {
  Write-Host 'Android emulator is already running or starting.'
  & $adb devices -l
  exit 0
}

Write-Host "Starting Android emulator in this terminal: $avdName"
Write-Host 'Keep this terminal open while using the emulator.'
Set-Location (Join-Path $sdkRoot 'emulator')
& $emulator `
  -avd $avdName `
  -netdelay none `
  -netspeed full `
  -no-snapshot-load `
  -no-snapshot-save `
  -gpu host `
  -no-boot-anim `
  -no-metrics
