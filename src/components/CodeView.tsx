// 代码编辑组件：CodeMirror 可编辑 + 语法高亮，支持 Ctrl+S 保存。
// Markdown（含 README）支持 Preview / Markdown 切换（对齐 Cursor）。
// 二进制或超大截断文件仍为只读预览。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";
import { readFile, writeFile, isTauri, openPathInExternalEditor } from "../api/tauri";
import { langExtensionsForPath } from "../utils/codemirrorLang";
import { useEditorLsp } from "../hooks/useEditorLsp";
import { tabCompletionExtension } from "../codemirror/tabCompletionExtension";
import {
  loadTabCompletionSettings,
  TAB_SETTINGS_CHANGE_EVENT,
} from "../utils/tabCompletionSettings";
import { registerEditorView, unregisterEditorView } from "../utils/editorCommands";
import { Markdown } from "./Markdown";
import { MarkdownViewToggle } from "./MarkdownViewToggle";
import {
  isMarkdownPath,
  loadMdEditorViewMode,
  saveMdEditorViewMode,
  type MdEditorViewMode,
} from "../utils/markdownPath";

interface CodeViewProps {
  /** 当前打开的文件绝对路径 */
  path: string;
  /** 工作区根目录（LSP rootUri） */
  workspaceRoot?: string | null;
  /** 是否可见（多标签时仅激活项为 true） */
  visible?: boolean;
  /** 嵌入模式：不渲染顶部单文件标签栏（由 EditorPanel 统一管理） */
  embedded?: boolean;
  /** 未保存状态变化回调 */
  onDirtyChange?: (dirty: boolean) => void;
  /** 关闭当前文件 */
  onClose: () => void;
}

/** 代码编辑器固定字号（全局缩放由 useUiZoom 整窗控制） */
const FONT_SIZE = 13;

export function CodeView({
  path,
  workspaceRoot = null,
  visible = true,
  embedded = false,
  onDirtyChange,
  onClose,
}: CodeViewProps) {
  const [text, setText] = useState("");
  /** 磁盘上已保存的内容，用于判断是否有未保存修改 */
  const [savedText, setSavedText] = useState("");
  const [meta, setMeta] = useState<{ truncated: boolean; binary: boolean }>({
    truncated: false,
    binary: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  /** 当前 CodeMirror 视图实例（用于注册到编辑命令总线） */
  const viewRef = useRef<EditorView | null>(null);
  /** Markdown 文件：preview 渲染 / source 源码编辑 */
  const [mdViewMode, setMdViewMode] = useState<MdEditorViewMode>(() => loadMdEditorViewMode());
  const isMarkdown = isMarkdownPath(path);
  const showMdPreview = isMarkdown && mdViewMode === "preview";
  const showMdSource = isMarkdown && mdViewMode === "source";

  const dirty = text !== savedText;
  /** 上报 dirty 状态给父组件（多标签场景） */
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  /** 仅文本文件且未截断时可编辑保存 */
  const editable = !meta.binary && !meta.truncated && !loading && !error;
  /** /lsp off 时禁用 language server 扩展 */
  const lspEnabled =
    editable &&
    (typeof localStorage === "undefined" || localStorage.getItem("ds_lsp_enabled") !== "0");
  const extensions = useMemo(() => langExtensionsForPath(path), [path]);
  /** LSP 补全/悬停/诊断（rust-analyzer、pyright、tsserver 等） */
  const { lspExtensions, lspHint } = useEditorLsp(workspaceRoot, path, lspEnabled);
  /** Tab 补全开关（设置页变更时热更新） */
  const [tabEnabled, setTabEnabled] = useState(() => loadTabCompletionSettings().enabled);
  useEffect(() => {
    const sync = () => setTabEnabled(loadTabCompletionSettings().enabled);
    window.addEventListener(TAB_SETTINGS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(TAB_SETTINGS_CHANGE_EVENT, sync);
  }, []);
  /** Cursor Tab 风格 AI 内联补全（与 LSP 互补） */
  const tabExtensions = useMemo(() => {
    if (!editable || !tabEnabled) return [];
    return [tabCompletionExtension(path)];
  }, [path, editable, tabEnabled]);
  /** 固定字号主题（整窗缩放见状态栏 / Ctrl+滚轮） */
  const fontTheme = useMemo(
    () =>
      EditorView.theme({
        "&": { height: "100%" },
        ".cm-gutters": { fontSize: `${FONT_SIZE}px` },
        ".cm-scroller": {
          overflow: "auto",
          lineHeight: 1.55,
        },
        ".cm-content": {
          fontFamily: '"Cascadia Code", "Consolas", monospace',
        },
      }),
    [],
  );
  const cmExtensions = useMemo(
    () => [...extensions, fontTheme, ...lspExtensions, ...tabExtensions],
    [extensions, fontTheme, lspExtensions, tabExtensions],
  );

  // 切换文件时重新读取，并恢复 Markdown 视图偏好
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setSaveMsg(null);
    if (isMarkdownPath(path)) {
      setMdViewMode(loadMdEditorViewMode(path));
    }
    readFile(path)
      .then((f) => {
        if (!alive) return;
        setText(f.content);
        setSavedText(f.content);
        setMeta({ truncated: f.truncated, binary: f.binary });
      })
      .catch((err) => alive && setError((err as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path]);

  /** 标签切换 / 全局缩放后让 CodeMirror 重新测量布局，避免高度错位无法滚动 */
  useEffect(() => {
    if (!visible || !viewRef.current) return;
    const remeasure = () => viewRef.current?.requestMeasure();
    remeasure();
    const raf = requestAnimationFrame(remeasure);
    window.addEventListener("ds-ui-zoom", remeasure);
    window.addEventListener("resize", remeasure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("ds-ui-zoom", remeasure);
      window.removeEventListener("resize", remeasure);
    };
  }, [visible, path, loading, showMdSource]);

  /** 切换 Markdown 预览/源码，并持久化偏好 */
  const onMdViewModeChange = useCallback((mode: MdEditorViewMode) => {
    setMdViewMode(mode);
    saveMdEditorViewMode(mode);
  }, []);

  /** 预览模式下卸载 CodeMirror，避免编辑命令误作用到隐藏编辑器 */
  useEffect(() => {
    if (!showMdPreview || !viewRef.current) return;
    unregisterEditorView(viewRef.current);
    viewRef.current = null;
  }, [showMdPreview]);

  /** 保存当前编辑内容到磁盘 */
  const save = useCallback(async () => {
    if (!path || !editable || !dirty || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await writeFile(path, text);
      setSavedText(text);
      // 保存后附带 LSP 状态提示（M4 / 4.8）
      if (lspHint) {
        setSaveMsg(`已保存 · ${lspHint}`);
      } else if (lspEnabled) {
        setSaveMsg("已保存 · LSP 就绪");
      } else {
        setSaveMsg("已保存");
      }
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg(`保存失败：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [path, editable, dirty, saving, text, lspHint, lspEnabled]);

  // Ctrl+S / Cmd+S 快捷键保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      // Markdown：Ctrl+Shift+V 切换 Preview / 源码（对齐 VS Code / Cursor）
      if (
        isMarkdown &&
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "v"
      ) {
        e.preventDefault();
        onMdViewModeChange(mdViewMode === "preview" ? "source" : "preview");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, isMarkdown, mdViewMode, onMdViewModeChange]);

  // 顶部「文件 > 保存」菜单触发：仅当前可见标签响应，避免多标签重复保存
  useEffect(() => {
    if (!visible) return;
    const onSave = () => void save();
    window.addEventListener("ds-editor-save", onSave);
    return () => window.removeEventListener("ds-editor-save", onSave);
  }, [visible, save]);

  // 组件卸载时从编辑命令总线注销视图
  useEffect(() => {
    return () => {
      if (viewRef.current) {
        unregisterEditorView(viewRef.current);
        viewRef.current = null;
      }
    };
  }, []);

  /** 关闭前若有未保存修改则确认 */
  const handleClose = () => {
    if (dirty && !window.confirm("有未保存的修改，确定关闭吗？")) return;
    onClose();
  };

  if (!path) {
    return <div className="code-empty">从左侧选择一个文件查看或编辑。</div>;
  }

  const fileName = path.split(/[\\/]/).pop();

  /** 工具栏：Markdown 视图切换 + 保存 + LSP 状态提示 */
  const actionButtons = editable ? (
    <>
      {lspHint && (
        <span className="code-lsp-hint" title={lspHint}>
          LSP 未就绪
        </span>
      )}
      {saveMsg && <span className="code-save-msg">{saveMsg}</span>}
      {isTauri() && (
        <button
          type="button"
          className="code-ext-editor-btn"
          title="在 VS Code / 外部编辑器打开"
          onClick={() => void openPathInExternalEditor(path)}
        >
          VS Code
        </button>
      )}
      <button
        className="btn-mini code-save-btn"
        onClick={() => void save()}
        disabled={!dirty || saving}
        title="保存 (Ctrl+S)"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </>
  ) : null;

  const toolbar = editable ? (
    isMarkdown ? (
      <div className="code-tab-actions code-tab-actions-md">
        <MarkdownViewToggle mode={mdViewMode} onChange={onMdViewModeChange} />
        <div className="code-tab-actions-right">{actionButtons}</div>
      </div>
    ) : (
      <div className="code-tab-actions">{actionButtons}</div>
    )
  ) : null;

  return (
    <div className={`code-view${visible ? "" : " code-hidden"}${embedded ? " code-embedded" : ""}`}>
      {!embedded ? (
        <div className="code-tab" title={path}>
          <span className="code-tab-name">
            {dirty && <span className="code-dirty" title="未保存">●</span>}
            {fileName}
            {meta.truncated && <span className="code-flag">（已截断·只读）</span>}
            {meta.binary && <span className="code-flag">（二进制·只读）</span>}
          </span>
          <div className="code-tab-actions-wrap">
            {toolbar}
            <button className="code-tab-close" title="关闭" onClick={handleClose}>
              ×
            </button>
          </div>
        </div>
      ) : (
        toolbar && <div className={`code-toolbar${isMarkdown ? " code-toolbar-md" : ""}`}>{toolbar}</div>
      )}
      <div className="code-scroll">
        {loading && <div className="code-loading">读取中…</div>}
        {error && <div className="code-error">{error}</div>}
        {!loading && !error && meta.binary && (
          <div className="code-binary">二进制文件，无法编辑。</div>
        )}
        {!loading && !error && !meta.binary && editable && showMdPreview && (
          <div className="code-md-preview">
            <Markdown text={text || "（空文档）"} />
          </div>
        )}
        {!loading && !error && !meta.binary && editable && (!isMarkdown || showMdSource) && (
          <div className="code-editor-wrap">
            <CodeMirror
              value={text}
              height="100%"
              theme={vscodeDark}
              extensions={cmExtensions}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                indentOnInput: true,
                tabSize: 4,
              }}
              onChange={(v) => setText(v)}
              onCreateEditor={(view) => {
                // 注册到编辑命令总线，使顶部菜单的撤销/查找等作用到本编辑器
                viewRef.current = view;
                registerEditorView(view);
              }}
            />
          </div>
        )}
        {!loading && !error && !meta.binary && meta.truncated && (
          <pre className="code-pre code-readonly">{text}</pre>
        )}
      </div>
    </div>
  );
}
