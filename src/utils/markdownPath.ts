// Markdown 文件路径判定与编辑器预览模式偏好（对齐 Cursor Preview / Markdown 切换）

/** Markdown 编辑器视图：渲染预览 或 源码编辑 */
export type MdEditorViewMode = "preview" | "source";

const MD_VIEW_KEY = "ds_md_editor_view";

/** 判断路径是否为 Markdown 类文件（含 README 变体与 .mdc 规则） */
export function isMarkdownPath(path: string): boolean {
  const base = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (base.startsWith("readme")) return true;
  const ext = base.includes(".") ? (base.split(".").pop() ?? "") : "";
  return ext === "md" || ext === "mdc" || ext === "markdown";
}

/** 读取 Markdown 编辑器默认视图（全局偏好，默认 Preview） */
export function loadMdEditorViewMode(_path?: string): MdEditorViewMode {
  try {
    const v = localStorage.getItem(MD_VIEW_KEY);
    if (v === "preview" || v === "source") return v;
  } catch {
    /* localStorage 不可用时回退预览 */
  }
  return "preview";
}

/** 持久化 Markdown 编辑器视图偏好 */
export function saveMdEditorViewMode(mode: MdEditorViewMode): void {
  try {
    localStorage.setItem(MD_VIEW_KEY, mode);
  } catch {
    /* 忽略写入失败 */
  }
}
