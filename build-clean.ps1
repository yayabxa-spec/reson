# 合规版构建脚本（在 compliance 分支上使用）
# 用法：  powershell -ExecutionPolicy Bypass -File .\build-clean.ps1

$ErrorActionPreference = "Stop"

$ToolRoot = "C:\Users\A3149\Documents\Codex\2026-08-04\kai\work\android-tools"
$env:JAVA_HOME = Join-Path $ToolRoot "jdk\jdk-17.0.20+8"
$env:ANDROID_HOME = Join-Path $ToolRoot "sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

# 固定 clean 皮肤（合规版默认，且禁止切回微信皮肤）
$env:EXPO_PUBLIC_APP_SKIN = "clean"
$env:EXPO_PUBLIC_APP_SKIN_FIXED = "1"

Push-Location (Join-Path $PSScriptRoot "android")
try {
  .\gradlew.bat assembleRelease --console=plain `
    -PreactNativeArchitectures=arm64-v8a `
    -I (Join-Path $ToolRoot "mirrors.init.gradle")
} finally {
  Pop-Location
}

Write-Host "构建完成：android\app\build\outputs\apk\release\app-release.apk"
