#!/usr/bin/env bash
# Deepseek-GUI 一键 release 构建（macOS / Linux）
# 本仓库仅含 GUI；TUI 需单独克隆 CodeWhale 并通过 CODEWHALE_ROOT 指向。
# 用法：export CODEWHALE_ROOT=../CodeWhale && ./scripts/build-release.sh
set -euo pipefail

GUI="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -n "${CODEWHALE_ROOT:-}" ]]; then
  CODEWHALE="$(cd "${CODEWHALE_ROOT}" && pwd)"
else
  for candidate in "../CodeWhale" "../DeepSeek-TUI" "../DeekSeel-TUI-GUI"; do
    if [[ -f "${GUI}/${candidate}/Cargo.toml" ]]; then
      CODEWHALE="$(cd "${GUI}/${candidate}" && pwd)"
      break
    fi
  done
fi

if [[ -z "${CODEWHALE:-}" || ! -f "${CODEWHALE}/Cargo.toml" ]]; then
  echo "未找到 TUI 仓库。请设置 CODEWHALE_ROOT 指向 CodeWhale/DeepSeek-TUI 克隆目录。" >&2
  exit 1
fi

TUI_OUT="${CODEWHALE}/target/release/deepseek-tui"
SIDECAR_DIR="${GUI}/src-tauri/bin"
RELEASE_DIR="${GUI}/src-tauri/target/release"

echo "==> GUI 根目录: ${GUI}"
echo "==> TUI 根目录: ${CODEWHALE}"

echo "==> 构建 deepseek-tui (release)..."
(cd "${CODEWHALE}" && cargo build --release -p deepseek-tui)

echo "==> 构建前端 dist..."
(cd "${GUI}" && npm run build)

echo "==> 复制 sidecar 到 src-tauri/bin..."
mkdir -p "${SIDECAR_DIR}"
cp -f "${TUI_OUT}" "${SIDECAR_DIR}/deepseek-tui"
chmod +x "${SIDECAR_DIR}/deepseek-tui"
mkdir -p "${RELEASE_DIR}"
cp -f "${TUI_OUT}" "${RELEASE_DIR}/deepseek-tui"
chmod +x "${RELEASE_DIR}/deepseek-tui"

echo "==> Tauri 打包..."
(cd "${GUI}" && npm run tauri:build)

echo ""
echo "构建完成。产物目录："
echo "  ${RELEASE_DIR}/bundle/"
