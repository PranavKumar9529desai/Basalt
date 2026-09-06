import { useEffect, useRef, useCallback } from "react";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  createEditorExtensions,
  readingExtensions,
  renderModeReading,
  type EditorConfig,
  type QueryResult,
} from "@workspace/editor";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLeafServices } from "@workspace/views";

export interface CanvasCardEditorProps {
  text: string;
  isEditing: boolean;
  onCommit?: (newText: string) => void;
  onCancel?: () => void;
  className?: string;
}

/** Card-optimized theme: compact padding, responsive font, cursor styling. */
const CANVAS_CARD_THEME = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--sat-editor-font-size, 13px)",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    padding: "8px 10px",
    fontFamily: "var(--sat-font-sans, system-ui, sans-serif)",
    overflowY: "auto",
    overflowX: "hidden",
  },
  ".cm-content": {
    padding: "0",
    maxWidth: "none",
    marginInline: "0",
  },
  ".cm-line": {
    maxWidth: "none",
    lineHeight: "1.5",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--sat-accent-primary, #6366f1)",
  },
});

export function CanvasCardEditor({
  text,
  isEditing,
  onCommit,
  onCancel,
  className = "",
}: CanvasCardEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latestTextRef = useRef(text);
  const onCommitRef = useRef(onCommit);
  const onCancelRef = useRef(onCancel);

  onCommitRef.current = onCommit;
  onCancelRef.current = onCancel;
  latestTextRef.current = text;

  let services: ReturnType<typeof useLeafServices> | null = null;
  try {
    services = useLeafServices();
  } catch {
    // Leaf services may be omitted in isolated unit tests
  }

  const onFetchLinks = useCallback(async (query: string) => {
    try {
      return await invoke<Array<{ name: string; path: string }>>("autocomplete_links", {
        prefix: query,
      });
    } catch {
      return [];
    }
  }, []);

  const onFetchTags = useCallback(async (query: string) => {
    try {
      return await invoke<string[]>("autocomplete_tags", { prefix: query });
    } catch {
      return [];
    }
  }, []);

  const onOpenLink = useCallback(
    (target: string) => {
      if (!services) return;
      const resolved = services.findNote(target);
      services.openNote(resolved?.path || target);
    },
    [services]
  );

  const openExternalLink = useCallback((url: string) => {
    openUrl(url).catch((err) => {
      console.error("[CanvasCardEditor] Failed to open external URL:", err);
    });
  }, []);

  const runQuery = useCallback(async (dql: string): Promise<QueryResult> => {
    return await invoke<QueryResult>("run_query", { dql });
  }, []);

  const commit = useCallback(() => {
    if (viewRef.current) {
      const currentText = viewRef.current.state.doc.toString();
      onCommitRef.current?.(currentText);
    }
  }, []);

  const cancel = useCallback(() => {
    onCancelRef.current?.();
  }, []);

  // Mount/reconfigure EditorView when `isEditing` changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Build common configuration
    const editorConfig: EditorConfig = {
      onFetchLinks,
      onFetchTags,
      onOpenLink,
      openExternalLink,
      runQuery,
      resolveAsset: services?.resolveAsset,
    };

    let extensions: Extension[];

    if (isEditing) {
      // Interactive edit mode
      const editKeymap = Prec.highest(
        keymap.of([
          {
            key: "Escape",
            run: () => {
              cancel();
              return true;
            },
          },
          {
            key: "Mod-Enter",
            run: () => {
              commit();
              return true;
            },
          },
        ])
      );

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          latestTextRef.current = update.state.doc.toString();
        }
      });

      extensions = [
        ...createEditorExtensions(editorConfig),
        CANVAS_CARD_THEME,
        editKeymap,
        updateListener,
      ];
    } else {
      // Read-only reading mode with all Basalt decorations
      extensions = [
        ...readingExtensions(editorConfig),
        renderModeReading,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        CANVAS_CARD_THEME,
      ];
    }

    const state = EditorState.create({
      doc: latestTextRef.current,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    if (isEditing) {
      // Focus and place cursor at end
      view.focus();
      const len = view.state.doc.length;
      view.dispatch({ selection: { anchor: len, head: len } });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [
    isEditing,
    onFetchLinks,
    onFetchTags,
    onOpenLink,
    openExternalLink,
    runQuery,
    services?.resolveAsset,
    commit,
    cancel,
  ]);

  // Sync external text updates when not editing
  useEffect(() => {
    if (isEditing || !viewRef.current) return;
    const currentDoc = viewRef.current.state.doc.toString();
    if (currentDoc !== text) {
      viewRef.current.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: text },
      });
    }
  }, [text, isEditing]);

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      if (!isEditing) return;
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (
        containerRef.current?.contains(relatedTarget) ||
        relatedTarget?.closest?.(".cm-tooltip-autocomplete")
      ) {
        return;
      }
      commit();
    },
    [isEditing, commit]
  );

  const handleKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditing) {
        // Prevent ReactFlow from intercepting Backspace/Delete/Space while editing
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }
    },
    [isEditing, commit, cancel]
  );

  return (
    <div
      ref={containerRef}
      className={`nodrag nopan nowheel w-full h-full min-h-0 overflow-hidden ${className}`}
      onBlur={handleBlur}
      onKeyDownCapture={handleKeyDownCapture}
      onPointerDownCapture={isEditing ? (e) => e.stopPropagation() : undefined}
    />
  );
}

export default CanvasCardEditor;
