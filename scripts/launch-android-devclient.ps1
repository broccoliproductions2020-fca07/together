$ErrorActionPreference = 'Stop'

# Fast, phantom-proof launch of the ALREADY-BUILT dev client.
#
# Why this exists: `npx expo run:android` enumerates every adb device and runs
# `adb -s <serial> emu avd name` on each. On this machine NTKDaemon (Nahimic
# audio) listens on port 5563, so adb registers a phantom emulator-5562 that has
# no console — the probe fails and Expo aborts before it ever builds or launches.
# This script never lets Expo touch device enumeration: it installs (if needed)
# and launches the app via targeted `adb -s emulator-5554` calls, and runs Metro
# with `expo start` (which does NOT enumerate on boot).
#
# For a NATIVE rebuild (new native deps), use scripts/build-android-devclient.ps1
# which builds via Gradle directly and then hands off to this launch flow.

$androidRoot = 'D:\Dokumente\AndroidDev\Android'
$sdkRoot = Join-Path $androidRoot 'Sdk'
$avdRoot = Join-Path $androidRoot 'avd'
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$deviceId = 'emulator-5554'
$pkg = 'com.broccolistudio.together.dev'
$scheme = 'together-dev'
$apk = 'D:\Dokumente\myapp\android\app\build\outputs\apk\debug\app-debug.apk'

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_AVD_HOME = $avdRoot
$env:EXPO_NO_DEPENDENCY_VALIDATION = '1'
$env:EXPO_LOCAL_DEV = '1'
$env:APP_VARIANT = 'development'
$env:EXPO_PUBLIC_FIREBASE_EMULATORS = 'true'
$env:EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED = 'false'
$env:EXPO_PUBLIC_CRASH_REPORTING_ENABLED = 'false'
# The local test setup must not wait for Expo's online configuration schema just
# to resolve manifest icons. The native dev client already contains these assets.
$env:EXPO_UNIVERSE_DIR = Join-Path $PSScriptRoot 'expo-universe'

# Ensure adb is available. All calls below target emulator-5554 explicitly, so
# stale phantom entries are harmless; restarting an already-running adb server
# can invalidate the emulator's current authorization on Windows.
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
& $adb start-server 2>$null | Out-Null
$adbStartExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($adbStartExitCode -ne 0) {
  throw "adb server could not be started (exit code $adbStartExitCode)."
}

Write-Host "Waiting for Android emulator ($deviceId)..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  $devices = & $adb devices
  if ($devices -match "$deviceId\s+device") {
    $booted = (& $adb -s $deviceId shell getprop sys.boot_completed 2>$null).Trim()
    if ($booted -eq '1') { $ready = $true; break }
  }
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw "Emulator not ready. Start it first with: npm run emulator" }

# sys.boot_completed can arrive a few seconds before Android's package service.
# Wait for it explicitly so a cold emulator launch does not abort.
$packageReady = $false
for ($i = 0; $i -lt 45; $i++) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $packageProbe = & $adb -s $deviceId shell pm path android 2>$null
  $packageExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($packageExitCode -eq 0 -and $packageProbe -match '^package:') {
    $packageReady = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $packageReady) { throw "Android package service did not become ready." }

& $adb -s $deviceId shell settings put secure show_ime_with_hard_keyboard 1 | Out-Null

# Install the prebuilt dev-client APK only if it isn't on the device already.
$installed = & $adb -s $deviceId shell pm list packages $pkg 2>$null
if (-not ($installed -match [regex]::Escape($pkg))) {
  if (-not (Test-Path $apk)) {
    throw "App not installed and no APK at $apk. Build first: npm run android:build"
  }
  Write-Host 'Installing dev-client APK (~30s)...'
  & $adb -s $deviceId install -r $apk
}

& $adb -s $deviceId reverse tcp:8081 tcp:8081 | Out-Null
# The local development app talks to the Firebase emulators. hostUri resolves
# to "localhost" over the dev-client connection, which on the emulator means the
# device itself — so forward the emulator ports (auth/firestore/database/UI) too,
# or guest login (anonymous auth) hangs forever. Start them with `npm run emulators`.
foreach ($p in 9099, 8080, 9000, 4000, 5001, 9198) {
  & $adb -s $deviceId reverse "tcp:$p" "tcp:$p" | Out-Null
}

# Launch the app once Metro is serving. Runs as a background job so the current
# terminal stays free to host Metro in the foreground.
Start-Job -ArgumentList $adb, $deviceId, $pkg, $scheme -ScriptBlock {
  param($adb, $deviceId, $pkg, $scheme)
  for ($i = 0; $i -lt 90; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8081/status' -TimeoutSec 2
      if ($r.StatusCode -eq 200) { break }
    } catch { Start-Sleep -Seconds 1 }
  }
  & $adb -s $deviceId reverse tcp:8081 tcp:8081 | Out-Null
  & $adb -s $deviceId shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 | Out-Null
  Start-Sleep -Seconds 1
  $url = 'http%3A%2F%2Flocalhost%3A8081'
  & $adb -s $deviceId shell am start -a android.intent.action.VIEW `
    -d "$scheme`://expo-development-client/?url=$url" | Out-Null
} | Out-Null

# Free a stale Metro on 8081. A killed/zombied dev server from a previous session
# keeps the port bound, and `expo start` then aborts on a non-interactive
# "use port 8082?" prompt — leaving the app stuck with no server to connect to.
$portPids = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $portPids) {
  Write-Host "Freeing stale process on :8081 (PID $p)..."
  Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
}

Write-Host 'Starting Metro (dev client). Keep this terminal open; the app opens automatically.'
& npx.cmd expo start --dev-client
