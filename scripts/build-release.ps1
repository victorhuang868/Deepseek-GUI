# Deepseek-GUI 一键 release 构建（Windows）
# 本仓库仅含 GUI；TUI 需单独克隆 CodeWhale 并通过 CODEWHALE_ROOT 指向。
# 用法：$env:CODEWHALE_ROOT = "E:\Coding\DeepSeek-TUI"; .\scripts\build-release.ps1
$ErrorActionPreference = "Stop"

$RustBin = "D:\Config\rust\rustup\toolchains\stable-x86_64-pc-windows-gnu\bin"
$MingwBin = "D:\Config\mingw64\bin"
$CargoHome = "D:\Config\rust\cargo\bin"
$env:Path = "$MingwBin;$RustBin;$CargoHome;" + $env:Path

$GuiRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
# TUI 源码根目录：环境变量优先，否则尝试同级 CodeWhale / DeepSeek-TUI 目录
$CodeWhaleRoot = if ($env:CODEWHALE_ROOT) {
    (Resolve-Path $env:CODEWHALE_ROOT).Path
} else {
    $candidates = @(
        (Join-Path $GuiRoot "..\CodeWhale"),
        (Join-Path $GuiRoot "..\DeepSeek-TUI"),
        (Join-Path $GuiRoot "..\DeekSeel-TUI-GUI")
    )
    $found = $candidates | Where-Object { Test-Path (Join-Path $_ "Cargo.toml") } | Select-Object -First 1
    if (-not $found) {
        throw "未找到 TUI 仓库。请设置 `$env:CODEWHALE_ROOT 指向 CodeWhale/DeepSeek-TUI 克隆目录。"
    }
    (Resolve-Path $found).Path
}

$TuiOut = Join-Path $CodeWhaleRoot "target\release\deepseek-tui.exe"
$SidecarDir = Join-Path $GuiRoot "src-tauri\bin"
$ReleaseDir = Join-Path $GuiRoot "src-tauri\target\release"

Write-Host "==> GUI 根目录: $GuiRoot"
Write-Host "==> TUI 根目录: $CodeWhaleRoot"

Write-Host "==> 停止可能占用文件的进程..."
Get-Process deepseek-gui, deepseek-tui -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "==> 构建 deepseek-tui (release)..."
Push-Location $CodeWhaleRoot
cargo build --release -p deepseek-tui
Pop-Location

Write-Host "==> 构建前端 dist..."
Push-Location $GuiRoot
npm run build
Pop-Location

Write-Host "==> 复制 sidecar 到 src-tauri/bin..."
New-Item -ItemType Directory -Force -Path $SidecarDir | Out-Null
Copy-Item -Force $TuiOut (Join-Path $SidecarDir "deepseek-tui.exe")
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
Copy-Item -Force $TuiOut (Join-Path $ReleaseDir "deepseek-tui.exe")

Write-Host "==> Tauri 打包 (NSIS + MSI)..."
Push-Location $GuiRoot
npm run tauri:build
Pop-Location

Write-Host ""
Write-Host "构建完成。产物目录："
Write-Host "  $ReleaseDir\bundle\"
