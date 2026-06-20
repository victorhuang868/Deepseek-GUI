// 应用主题：CSS 变量切换（对齐 TUI /theme，GUI 提供精简主题集）

import { THEME_KEY } from "./guiPrefs";

/** 可选主题 */
export interface ThemeDef {
  id: string;
  nameZh: string;
  nameEn: string;
}

/** GUI 内置主题列表 */
export const THEMES: ThemeDef[] = [
  { id: "cursor", nameZh: "Cursor 深色", nameEn: "Cursor Dark" },
  { id: "github-dark", nameZh: "GitHub 深色", nameEn: "GitHub Dark" },
  { id: "light", nameZh: "浅色", nameEn: "Light" },
  { id: "high-contrast", nameZh: "高对比", nameEn: "High contrast" },
];

/** 读取已保存主题 id */
export function loadThemeId(): string {
  return localStorage.getItem(THEME_KEY) ?? "cursor";
}

/** 应用主题到 document（cursor 为默认 :root） */
export function applyTheme(id: string): void {
  const root = document.documentElement;
  if (!id || id === "cursor") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", id);
  }
  localStorage.setItem(THEME_KEY, id || "cursor");
  window.dispatchEvent(new CustomEvent("ds-theme-changed"));
}

/** 启动时恢复主题 */
export function initThemeFromStorage(): void {
  applyTheme(loadThemeId());
}
