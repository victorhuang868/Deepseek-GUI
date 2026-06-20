#!/usr/bin/env bash
# Deepseek-GUI 一键 release 构建（macOS / Linux）
# 本仓库仅含 GUI；TUI 需单独克隆 CodeWhale v0.8.62+ 并通过 CODEWHALE_ROOT 指向。
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
  echo "未找到 TUI 仓库。请设置 CODEWHALE_ROOT 指向 CodeWhale 克隆目录（建议 v0.8.62+）。" >&2
  exit 1
fi

# 根据 crates/tui 包名识别 sidecar（CodeWhale 新名 / DeepSeek 旧名）
TUI_CRATE="codewhale-tui"
TUI_BIN="codewhale-tui"
if [[ -f "${CODEWHALE}/crates/tui/Cargo.toml" ]] && grep -q 'name = "deepseek-tui"' "${CODEWHALE}/crates/tui/Cargo.toml"; then
  TUI_CRATE="deepseek-tui"
  TUI_BIN="deepseek-tui"
fi

TUI_OUT="${CODEWHALE}/target/release/${TUI_BIN}"
SIDECAR_DIR="${GUI}/src-tauri/bin"
RELEASE_DIR="${GUI}/src-tauri/target/release"

echo "==> GUI 根目录: ${GUI}"
echo "==> TUI 根目录: ${CODEWHALE}"
echo "==> Sidecar crate: ${TUI_CRATE} -> ${TUI_BIN}"

echo "==> 构建 ${TUI_CRATE} (release)..."
(cd "${CODEWHALE}" && cargo build --release -p "${TUI_CRATE}")

if [[ ! -f "${TUI_OUT}" ]]; then
  echo "未找到 sidecar 产物: ${TUI_OUT}" >&2
  exit 1
fi

echo "==> 构建前端 dist..."
(cd "${GUI}" && npm run build)

echo "==> 复制 sidecar 到 src-tauri/bin..."
mkdir -p "${SIDECAR_DIR}"
cp -f "${TUI_OUT}" "${SIDECAR_DIR}/${TUI_BIN}"
chmod +x "${SIDECAR_DIR}/${TUI_BIN}"
mkdir -p "${RELEASE_DIR}"
cp -f "${TUI_OUT}" "${RELEASE_DIR}/${TUI_BIN}"
chmod +x "${RELEASE_DIR}/${TUI_BIN}"

echo "==> Tauri 打包..."
(cd "${GUI}" && npm run tauri:build)

echo ""
echo "构建完成。产物目录："
echo "  ${RELEASE_DIR}/bundle/"
