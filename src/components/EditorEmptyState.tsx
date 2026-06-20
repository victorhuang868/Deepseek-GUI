// 编辑器空状态（仿 Cursor）：无打开文件时的居中引导与快捷键

import { t, type Locale } from "../i18n";

interface EditorEmptyStateProps {
  locale: Locale;
  hasFolder: boolean;
  onOpenFolder: () => void;
  onQuickOpen: () => void;
  onCommandPalette: () => void;
  onSearchChats: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
}

/** 可点击的快捷键行 */
function ShortcutRow({
  keys,
  desc,
  onClick,
  disabled,
}: {
  keys: string;
  desc: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Tag = onClick && !disabled ? "button" : "div";
  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      className={`editor-empty-row${onClick && !disabled ? " clickable" : ""}${disabled ? " disabled" : ""}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <kbd className="editor-empty-kbd">{keys}</kbd>
      <span className="editor-empty-desc">{desc}</span>
    </Tag>
  );
}

/** 空状态装饰图标：简约文档线条（对齐 Cursor 欢迎页，避免圆点像「头」） */
function EmptyStateArt() {
  return (
    <svg className="editor-empty-art" viewBox="0 0 64 64" aria-hidden>
      {/* 底层文件 */}
      <rect
        x="14"
        y="10"
        width="36"
        height="44"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.22"
      />
      {/* 前景文件 */}
      <rect
        x="18"
        y="14"
        width="36"
        height="44"
        rx="5"
        fill="var(--bg-elev)"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <line x1="24" y1="26" x2="48" y2="26" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <line x1="24" y1="34" x2="44" y2="34" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
      <line x1="24" y1="42" x2="40" y2="42" stroke="currentColor" strokeWidth="1.5" opacity="0.22" />
    </svg>
  );
}

/**
 * 中间编辑器无标签时的占位视图
 * 居中卡片 + 四周留白，快捷键与装饰图标并排（窄屏自动换行）
 */
export function EditorEmptyState({
  locale,
  hasFolder,
  onOpenFolder,
  onQuickOpen,
  onCommandPalette,
  onSearchChats,
  onOpenSettings,
  onNewChat,
}: EditorEmptyStateProps) {
  const zh = locale === "zh";

  return (
    <div className="editor-empty">
      <div className="editor-empty-panel">
        <div className="editor-empty-body">
          <EmptyStateArt />
          <div className="editor-empty-content">
            <p className="editor-empty-hint">
              {hasFolder
                ? zh
                  ? "从左侧资源管理器打开文件，或使用下方快捷键。"
                  : "Open a file from the explorer, or use a shortcut below."
                : zh
                  ? "打开项目文件夹以浏览与编辑代码。"
                  : "Open a project folder to browse and edit code."}
            </p>

            <div className="editor-empty-shortcuts">
              {!hasFolder && (
                <ShortcutRow
                  keys={zh ? "打开" : "Open"}
                  desc={t("app.openFolder", locale)}
                  onClick={onOpenFolder}
                />
              )}
              <ShortcutRow
                keys="Ctrl+P"
                desc={t("palette.quickOpen", locale)}
                onClick={onQuickOpen}
                disabled={!hasFolder}
              />
              <ShortcutRow
                keys="Ctrl+K"
                desc={zh ? "命令面板" : "Command Palette"}
                onClick={onCommandPalette}
              />
              <ShortcutRow
                keys="Ctrl+Shift+P"
                desc={t("search.threadsTitle", locale)}
                onClick={onSearchChats}
              />
              <ShortcutRow
                keys="Ctrl+,"
                desc={t("status.settings", locale)}
                onClick={onOpenSettings}
              />
              <ShortcutRow
                keys={zh ? "新建" : "New"}
                desc={t("app.newThread", locale)}
                onClick={onNewChat}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
