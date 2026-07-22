$ErrorActionPreference = 'Stop'

# Same env bootstrap as start-expo-android.ps1, but for the custom dev-client
# build (npx expo run:android) instead of Expo Go — needed to actually embed
# our own GOOGLE_MAPS_API_KEY_ANDROID/_IOS natively (Expo Go always uses
# Expo's own shared Maps key and can't carry a project-specific one).

$androidRoot = 'D:\Dokumente\AndroidDev\Android'
$sdkRoot = Join-Path $androidRoot 'Sdk'
$avdRoot = Join-Path $androidRoot 'avd'
$expoRoot = 'D:\Dokumente\AndroidDev\Expo'
$javaHome = 'D:\Dokumente\AndroidDev\Java\jdk-21.0.11+10'
$deviceId = 'emulator-5554'

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_AVD_HOME = $avdRoot
$env:__UNSAFE_EXPO_HOME_DIRECTORY = $expoRoot
# Keep the Gradle home on D: too — C: has ~0 GB free and the default location
# (C:\Users\<user>\.gradle) fills it up and fails the build. See AGENTS.md:
# all Android tooling lives under AndroidDev, not C:.
$env:GRADLE_USER_HOME = 'D:\Dokumente\AndroidDev\Gradle'
# Gradle needs JAVA_HOME; the JDK lives under AndroidDev like the rest of the
# Android toolchain (see AGENTS.md). Fall back to the Adoptium install if the
# AndroidDev copy is ever missing.
if (Test-Path (Join-Path $javaHome 'bin\java.exe')) {
  $env:JAVA_HOME = $javaHome
} elseif (Test-Path 'C:\Program Files\Eclipse Adoptium') {
  $jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory |
    Where-Object { $_.Name -like 'jdk*' } | Sort-Object Name | Select-Object -Last 1
  if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}
$env:Path = "$env:JAVA_HOME\bin;$sdkRoot\platform-tools;$sdkRoot\emulator;$sdkRoot\cmdline-tools\latest\bin;$env:Path"
$env:EXPO_NO_DEPENDENCY_VALIDATION = '1'

$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
# A prior crashed emulator launch can leave a phantom "offline" device (e.g.
# emulator-5562) that the Expo CLI chokes on while enumerating devices. A full
# adb server restart clears these stale entries; the real emulator re-registers.
$devices = & $adb devices
if ($devices -match 'emulator-\d+\s+offline') {
  Write-Host 'Clearing stale offline emulator entries...'
  & $adb kill-server | Out-Null
  Start-Sleep -Seconds 1
  & $adb start-server | Out-Null
  Start-Sleep -Seconds 1
} else {
  & $adb start-server | Out-Null
}

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

Write-Host 'Building and installing the dev client (npx expo run:android)...'
Write-Host 'This is a real native Gradle build — first run can take several minutes.'
# No --device flag: with a single booted emulator, Expo targets it automatically.
# (expo run:android matches --device against AVD names, not adb serials like
# emulator-5554, so passing the serial fails with "Could not find device".)
& npx.cmd expo run:android
