# Deepseek-GUI 一键 release 构建（Windows）
# 本仓库仅含 GUI；TUI 需单独克隆 CodeWhale v0.8.62+ 并通过 CODEWHALE_ROOT 指向。
# 用法：$env:CODEWHALE_ROOT = "E:\Coding\CodeWhale"; .\scripts\build-release.ps1
$ErrorActionPreference = "Stop"

$RustBin = "D:\Config\rust\rustup\toolchains\stable-x86_64-pc-windows-gnu\bin"
$MingwBin = "D:\Config\mingw64\bin"
$CargoHome = "D:\Config\rust\cargo\bin"
$env:Path = "$MingwBin;$RustBin;$CargoHome;" + $env:Path

$GuiRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

# TUI 源码根目录：环境变量优先，否则尝试同级 CodeWhale 等目录
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
        throw "未找到 TUI 仓库。请设置 `$env:CODEWHALE_ROOT 指向 CodeWhale 克隆目录（建议 v0.8.62+）。"
    }
    (Resolve-Path $found).Path
}

# 根据 crates/tui 包名自动识别 codewhale-tui（新）或 deepseek-tui（旧）
$TuiCargoToml = Join-Path $CodeWhaleRoot "crates\tui\Cargo.toml"
$TuiCrate = "codewhale-tui"
$TuiBinName = "codewhale-tui.exe"
if (Test-Path $TuiCargoToml) {
    $toml = Get-Content $TuiCargoToml -Raw
    if ($toml -match 'name\s*=\s*"deepseek-tui"') {
        $TuiCrate = "deepseek-tui"
        $TuiBinName = "deepseek-tui.exe"
    }
}

$TuiOut = Join-Path $CodeWhaleRoot "target\release\$TuiBinName"
$SidecarDir = Join-Path $GuiRoot "src-tauri\bin"
$ReleaseDir = Join-Path $GuiRoot "src-tauri\target\release"

Write-Host "==> GUI 根目录: $GuiRoot"
Write-Host "==> TUI 根目录: $CodeWhaleRoot"
Write-Host "==> Sidecar crate: $TuiCrate -> $TuiBinName"

Write-Host "==> 停止可能占用文件的进程..."
Get-Process deepseek-gui, codewhale-tui, deepseek-tui -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "==> 构建 $TuiCrate (release)..."
Push-Location $CodeWhaleRoot
cargo build --release -p $TuiCrate
Pop-Location

if (-not (Test-Path $TuiOut)) {
    throw "未找到 sidecar 产物: $TuiOut"
}

Write-Host "==> 构建前端 dist..."
Push-Location $GuiRoot
npm run build
Pop-Location

Write-Host "==> 复制 sidecar 到 src-tauri/bin..."
New-Item -ItemType Directory -Force -Path $SidecarDir | Out-Null
Copy-Item -Force $TuiOut (Join-Path $SidecarDir $TuiBinName)
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
Copy-Item -Force $TuiOut (Join-Path $ReleaseDir $TuiBinName)

Write-Host "==> Tauri 打包 (NSIS + MSI)..."
Push-Location $GuiRoot
npm run tauri:build
Pop-Location

Write-Host ""
Write-Host "构建完成。产物目录："
Write-Host "  $ReleaseDir\bundle\"
