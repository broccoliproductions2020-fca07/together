# Builds the Android dev client.
#
# Architectures are restricted on purpose. The full default set
# (armeabi-v7a,arm64-v8a,x86,x86_64) breaks on Windows: the C++ codegen paths of
# the New Architecture exceed MAX_PATH, and `ninja.exe` shipped with the SDK's
# CMake 3.22.1 is not long-path aware — even though Windows itself has
# LongPathsEnabled=1. The failure is marginal, a couple of characters: arm64-v8a
# (9 chars) builds, armeabi-v7a (11) does not.
#
# armeabi-v7a and x86 are 32-bit and obsolete anyway (Play Store requires 64-bit),
# so dropping them costs nothing and roughly halves the build time.
#
#   x86_64     -> the Android emulator
#   arm64-v8a  -> real phones
param(
  [string]$Architectures = 'x86_64'
)

$ErrorActionPreference = 'Stop'

$androidRoot = 'D:\Dokumente\AndroidDev\Android'
$env:ANDROID_HOME = Join-Path $androidRoot 'Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:APP_VARIANT = 'development'
$env:EXPO_PUBLIC_FIREBASE_EMULATORS = 'true'
$env:EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED = 'false'
$env:EXPO_PUBLIC_CRASH_REPORTING_ENABLED = 'false'

$firebaseConfig = Join-Path $PSScriptRoot '..\firebase\native\dev\google-services.json'
$androidFirebaseConfig = Join-Path $PSScriptRoot '..\android\app\google-services.json'
if (-not (Test-Path -LiteralPath $firebaseConfig)) {
  throw "Missing local Firebase development configuration: $firebaseConfig"
}
Copy-Item -LiteralPath $firebaseConfig -Destination $androidFirebaseConfig -Force

Write-Host "Building dev client for: $Architectures"
Set-Location (Join-Path $PSScriptRoot '..\android')
& .\gradlew.bat assembleDebug --no-daemon "-PreactNativeArchitectures=$Architectures"
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }

$apk = Join-Path $PSScriptRoot '..\android\app\build\outputs\apk\debug\app-debug.apk'
Write-Host "APK: $apk"
