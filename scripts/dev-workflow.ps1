# Deepseek-GUI 标准开发流程脚本
# 顺序：CodeWhale(GitHub) -> compare-gap -> DeekSeel-TUI-GUI -> Deepseek-GUI-git -> GitHub -> cleanup
#
# 用法：
#   .\scripts\dev-workflow.ps1 update-codewhale
#   .\scripts\dev-workflow.ps1 compare-gap
#   .\scripts\dev-workflow.ps1 sync-tui
#   .\scripts\dev-workflow.ps1 sync-gui-git
#   .\scripts\dev-workflow.ps1 push-gui -Message "..."
#   .\scripts\dev-workflow.ps1 cleanup-workspace
#   .\scripts\dev-workflow.ps1 pull-all
#   .\scripts\dev-workflow.ps1 publish -Message "..."
#   .\scripts\dev-workflow.ps1 full-cycle -Message "..."
#
param(
    [Parameter(Position = 0)]
    [ValidateSet("update-codewhale", "compare-gap", "sync-tui", "sync-gui-git", "push-gui", "cleanup-workspace", "pull-all", "publish", "full-cycle", "help")]
    [string]$Action = 'help',

    [string]$Message = '',
    [string]$CodeWhaleRef = 'main'
)

$ErrorActionPreference = "Stop"

# 固定路径（可按本机调整环境变量覆盖）
$CodeWhaleRoot = if ($env:CODEWHALE_ROOT) { (Resolve-Path $env:CODEWHALE_ROOT).Path } else { "E:\Coding\CodeWhale" }
$WorkspaceRoot = if ($env:DEEKSEEL_WORKSPACE) { (Resolve-Path $env:DEEKSEEL_WORKSPACE).Path } else { "E:\Coding\DeekSeel-TUI-GUI" }
$GuiGitRoot = if ($env:DEEPSEEK_GUI_GIT) { (Resolve-Path $env:DEEPSEEK_GUI_GIT).Path } else { "E:\Coding\Deepseek-GUI-git" }
$GuiDevRoot = Join-Path $WorkspaceRoot "Deepseek-GUI"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Ensure-GitRepo([string]$Path, [string]$Label) {
    if (-not (Test-Path (Join-Path $Path ".git"))) {
        throw "$Label 不是 Git 仓库: $Path"
    }
}

function Invoke-UpdateCodeWhale {
    Write-Step "更新 CodeWhale: $CodeWhaleRoot (ref: $CodeWhaleRef)"
    Ensure-GitRepo $CodeWhaleRoot "CodeWhale"
    Push-Location $CodeWhaleRoot
    try {
        git fetch origin --tags
        if ($CodeWhaleRef -match "^(main|master)$") {
            # 显式 fetch 分支，避免浅克隆/detached HEAD 无 origin/main 引用
            git fetch origin "${CodeWhaleRef}:refs/remotes/origin/${CodeWhaleRef}"
            git checkout -B $CodeWhaleRef "origin/$CodeWhaleRef"
            git pull origin $CodeWhaleRef
        } else {
            git fetch origin "tags/${CodeWhaleRef}:refs/tags/${CodeWhaleRef}" 2>$null
            git checkout $CodeWhaleRef
        }
        Write-Host "当前:" (git log -1 --oneline)
        Write-Host "版本:" (git describe --tags --always)
    } finally {
        Pop-Location
    }
}

function Invoke-CompareGap {
    Write-Step "对比 CodeWhale 与 Deepseek-GUI 功能差距"
    $py = Join-Path $ScriptDir "compare-gap.py"
    if (-not (Test-Path $py)) {
        throw "找不到 compare-gap.py: $py"
    }
    $env:CODEWHALE_ROOT = $CodeWhaleRoot
    $env:DEEKSEEL_WORKSPACE = $WorkspaceRoot
    python $py $CodeWhaleRoot $WorkspaceRoot
    if ($LASTEXITCODE -ne 0) {
        throw "compare-gap 失败 exit=$LASTEXITCODE"
    }
}

function Invoke-SyncTuiToWorkspace {
    Write-Step "同步 TUI: $CodeWhaleRoot -> $WorkspaceRoot （保留 Deepseek-GUI/）"
    if (-not (Test-Path $CodeWhaleRoot)) {
        throw "CodeWhale 目录不存在: $CodeWhaleRoot"
    }
    if (-not (Test-Path $WorkspaceRoot)) {
        throw "工作区不存在: $WorkspaceRoot"
    }

    # robocopy 排除 GUI 子目录与构建产物
    $excludeDirs = @(
        "Deepseek-GUI",
        ".git",
        "target",
        "node_modules",
        ".cursor-chat-migration-backup"
    )
    $xd = ($excludeDirs | ForEach-Object { "/XD"; $_ })

    & robocopy $CodeWhaleRoot $WorkspaceRoot /E /XO /NFL /NDL /NJH /NJS /nc /ns /np @xd | Out-Null
    $rc = $LASTEXITCODE
    if ($rc -ge 8) {
        throw "robocopy 失败，exit=$rc"
    }
    Write-Host "TUI 同步完成（Deepseek-GUI/ 未覆盖）"
}

function Invoke-SyncGuiToGit {
    Write-Step "同步 GUI: $GuiDevRoot -> $GuiGitRoot"
    if (-not (Test-Path $GuiDevRoot)) {
        throw "GUI 开发目录不存在: $GuiDevRoot"
    }
    if (-not (Test-Path $GuiGitRoot)) {
        throw "GUI Git 目录不存在: $GuiGitRoot"
    }

    $excludeDirs = @("node_modules", "dist", "src-tauri\target", "src-tauri\bin", "src-tauri\gen")
    $excludeFiles = @("README.bak.md", "GUI-CHANGELOG.bak.md", "CHANGELOG.bak.md", "PROJECT.bak.md")
    $xd = ($excludeDirs | ForEach-Object { "/XD"; $_ })
    $xf = ($excludeFiles | ForEach-Object { "/XF"; $_ })

    & robocopy $GuiDevRoot $GuiGitRoot /E /XO /NFL /NDL /NJH /NJS /nc /ns /np @xd @xf | Out-Null
    $rc = $LASTEXITCODE
    if ($rc -ge 8) {
        throw "robocopy 失败，exit=$rc"
    }
    Write-Host "GUI 已同步到 Deepseek-GUI-git"
}

function Invoke-PushGuiGit {
    param([string]$CommitMessage)
    if (-not $CommitMessage) {
        throw 'push-gui 需要 -Message "提交说明"'
    }
    Write-Step "提交并 push: $GuiGitRoot"
    Ensure-GitRepo $GuiGitRoot "Deepseek-GUI-git"
    Push-Location $GuiGitRoot
    try {
        git status --short
        git add -A
        $status = git status --porcelain
        if (-not $status) {
            Write-Host "无变更，跳过 commit"
            return
        }
        git commit -m $CommitMessage
        git push origin HEAD
        Write-Host "已 push:" (git rev-parse --abbrev-ref HEAD)
    } finally {
        Pop-Location
    }
}

function Invoke-CleanupWorkspace {
    Write-Step "清理工作区无关文件: $WorkspaceRoot"

    $removed = @()

    # 根目录临时 Python 脚本（迁移/同步辅助）
    Get-ChildItem -Path $WorkspaceRoot -Filter "_*.py" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item $_.FullName -Force
        $removed += $_.Name
    }

    # Deepseek-GUI 内 README/CHANGELOG 备份
    Get-ChildItem -Path $GuiDevRoot -Filter "*.bak.md" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item $_.FullName -Force
        $removed += "Deepseek-GUI\$($_.Name)"
    }

    # CodeWhale 构建日志
    $buildLog = Join-Path $CodeWhaleRoot "CodeWhale-build.log"
    if (Test-Path $buildLog) {
        Remove-Item $buildLog -Force
        $removed += "CodeWhale\CodeWhale-build.log"
    }

    # Deepseek-GUI-git 中误同步的 .bak
    if (Test-Path $GuiGitRoot) {
        Get-ChildItem -Path $GuiGitRoot -Filter "*.bak.md" -File -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item $_.FullName -Force
            $removed += "Deepseek-GUI-git\$($_.Name)"
        }
    }

    if ($removed.Count -eq 0) {
        Write-Host "无需清理"
    } else {
        Write-Host "已删除 $($removed.Count) 个文件:"
        $removed | ForEach-Object { Write-Host "  - $_" }
    }
}

function Show-Help {
    @"

Deepseek-GUI 开发流程
  CodeWhale -> compare-gap -> DeekSeel-TUI-GUI -> Deepseek-GUI-git -> GitHub -> cleanup

命令:
  update-codewhale       从 GitHub 更新 E:\Coding\CodeWhale
  compare-gap            对比 TUI 与 Deepseek-GUI，生成 docs/TUI-GUI-GAP.md
  sync-tui               CodeWhale -> DeekSeel-TUI-GUI 根目录（不覆盖 Deepseek-GUI）
  sync-gui-git           Deepseek-GUI -> Deepseek-GUI-git
  push-gui -Message      commit + push Deepseek-GUI-git
  cleanup-workspace      清理临时脚本、.bak.md、构建日志
  pull-all               update-codewhale + compare-gap + sync-tui
  publish -Message       sync-gui-git + push-gui
  full-cycle -Message    pull-all + publish + cleanup-workspace

环境变量（可选）:
  CODEWHALE_ROOT         默认 E:\Coding\CodeWhale
  DEEKSEEL_WORKSPACE     默认 E:\Coding\DeekSeel-TUI-GUI
  DEEPSEEK_GUI_GIT       默认 E:\Coding\Deepseek-GUI-git

"@
}

switch ($Action) {
    "update-codewhale" { Invoke-UpdateCodeWhale }
    "compare-gap" { Invoke-CompareGap }
    "sync-tui" { Invoke-SyncTuiToWorkspace }
    "sync-gui-git" { Invoke-SyncGuiToGit }
    "push-gui" { Invoke-PushGuiGit -CommitMessage $Message }
    "cleanup-workspace" { Invoke-CleanupWorkspace }
    "pull-all" {
        Invoke-UpdateCodeWhale
        Invoke-CompareGap
        Invoke-SyncTuiToWorkspace
    }
    "publish" {
        Invoke-SyncGuiToGit
        Invoke-PushGuiGit -CommitMessage $Message
    }
    "full-cycle" {
        if (-not $Message) {
            throw 'full-cycle 需要 -Message "提交说明"'
        }
        Invoke-UpdateCodeWhale
        Invoke-CompareGap
        Invoke-SyncTuiToWorkspace
        Invoke-SyncGuiToGit
        Invoke-PushGuiGit -CommitMessage $Message
        Invoke-CleanupWorkspace
    }
    default { Show-Help }
}
