$ErrorActionPreference = 'Stop'

$androidRoot = 'D:\Dokumente\AndroidDev\Android'
$sdkRoot = Join-Path $androidRoot 'Sdk'
$avdRoot = Join-Path $androidRoot 'avd'
$expoRoot = 'D:\Dokumente\AndroidDev\Expo'
$expoGoApk = Join-Path $expoRoot 'android-apk-cache\Expo-Go-54.0.8.apk'
$port = 8082
$deviceId = 'emulator-5554'

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_AVD_HOME = $avdRoot
$env:__UNSAFE_EXPO_HOME_DIRECTORY = $expoRoot
$env:Path = "$sdkRoot\platform-tools;$sdkRoot\emulator;$sdkRoot\cmdline-tools\latest\bin;$env:Path"
$env:EXPO_NO_DEPENDENCY_VALIDATION = '1'

$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
& $adb start-server | Out-Null
& $adb disconnect emulator-5562 | Out-Null

Write-Host "Waiting for Android emulator ($deviceId)..."
$deviceReady = $false
for ($i = 0; $i -lt 45; $i++) {
  $devices = & $adb devices
  if ($devices -match "$deviceId\s+device") {
    $booted = (& $adb -s $deviceId shell getprop sys.boot_completed).Trim()
    if ($booted -eq '1') {
      $deviceReady = $true
      break
    }
  }
  Start-Sleep -Seconds 2
}

if (-not $deviceReady) {
  throw "Android emulator is not ready. Start it first with: npm run emulator"
}

$expoGoInstalled = (& $adb -s $deviceId shell pm list packages host.exp.exponent) -match 'host.exp.exponent'
if (-not $expoGoInstalled) {
  if (-not (Test-Path $expoGoApk)) {
    throw "Expo Go is not installed and no cached APK was found at $expoGoApk"
  }

  Write-Host 'Installing cached Expo Go APK...'
  & $adb -s $deviceId install -r $expoGoApk | Out-Null
}

function Test-MetroRunning {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$port/status" -TimeoutSec 2
    $content = if ($response.Content -is [byte[]]) {
      [System.Text.Encoding]::UTF8.GetString($response.Content)
    } else {
      [string]$response.Content
    }
    return ($content -match 'packager-status:running')
  } catch {
    return $false
  }
}

$startedMetro = $false
$metroProcess = $null

if (Test-MetroRunning) {
  Write-Host "Metro is already running on port $port."
} else {
  Write-Host "Starting Expo Go Metro server on port $port..."
  $metroProcess = Start-Process `
    -FilePath 'npx.cmd' `
    -ArgumentList @('expo', 'start', '--go', '--localhost', '--port', "$port") `
    -NoNewWindow `
    -PassThru
  $startedMetro = $true

  for ($i = 0; $i -lt 60; $i++) {
    if (Test-MetroRunning) {
      break
    }
    if ($metroProcess.HasExited) {
      throw 'Metro exited before it became ready.'
    }
    Start-Sleep -Seconds 1
  }

  if (-not (Test-MetroRunning)) {
    throw "Metro did not become ready on port $port."
  }
}

Write-Host 'Connecting emulator to Metro...'
& $adb -s $deviceId reverse "tcp:$port" "tcp:$port" | Out-Null
Write-Host 'Connecting emulator to Firebase emulators...'
foreach ($firebasePort in @(9099, 8080, 9000)) {
  & $adb -s $deviceId reverse "tcp:$firebasePort" "tcp:$firebasePort" | Out-Null
}
& $adb -s $deviceId shell am force-stop host.exp.exponent | Out-Null
& $adb -s $deviceId shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:$port" host.exp.exponent | Out-Null

Write-Host ''
Write-Host 'Together should now be open in Expo Go on the Android emulator.'
Write-Host 'Keep this terminal open while developing. Press Ctrl+C to stop Metro.'

if ($startedMetro -and $metroProcess -ne $null) {
  Wait-Process -Id $metroProcess.Id
}
