# 本机构建脚本（适配 yayabxa 这台电脑，替代旧电脑的 build-clean.ps1）
# 用法：powershell -ExecutionPolicy Bypass -File .\build-local.ps1
# 自用版（微信皮肤默认）；如需合规版 clean 皮肤，取消注释最后两行 env。

$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "D:\Program Files\Java\jdk-21.0.11"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
# Gradle 缓存/依赖下载全部落到 F 盘（避免占用 C 盘）
$env:GRADLE_USER_HOME = "F:\.gradle"

# 默认自用版皮肤（wechat）。构建合规版时打开下面两行：
# $env:EXPO_PUBLIC_APP_SKIN = "clean"
# $env:EXPO_PUBLIC_APP_SKIN_FIXED = "1"

Push-Location (Join-Path $PSScriptRoot "android")
try {
  .\gradlew.bat assembleRelease --console=plain `
    -PreactNativeArchitectures=arm64-v8a `
    -x lintVitalAnalyzeRelease -x lintVitalRelease `
    -I (Join-Path $PSScriptRoot "mirrors.init.gradle")
  if ($LASTEXITCODE -ne 0) { throw "gradle 构建失败（exit $LASTEXITCODE）" }
} finally {
  Pop-Location
}

Write-Host "构建完成：android\app\build\outputs\apk\release\app-release.apk"
