import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  contextMenuExtension,
  createEditorExtensions,
  type ContextMenuState,
} from "@workspace/editor";
import { useKeybindingService } from "@workspace/keybindings";
import { useLeafServices, type LeafProps } from "@workspace/views";
import { Button } from "@workspace/ui/components/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { FileChangeEvent, SaveStatus } from "../../vault/types";
import { useLatestRef } from "../hooks/useLatestRef";
import { useNoteIO } from "../hooks/useNoteIO";
import { useFocusedPaneStore } from "../store";
import { EditorComponent } from "./EditorComponent";
import { EditorContextMenu } from "./EditorContextMenu";

const AUTOSAVE_DEBOUNCE_MS = 2000;
const STATS_DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Conflict banner + save indicator (rendered above the editor)
// ---------------------------------------------------------------------------

function ConflictBanner({
  onKeepMine,
  onDiscard,
}: {
  onKeepMine: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[color-mix(in_srgb,var(--sat-state-danger) 18%,transparent)] border-b border-[var(--sat-state-danger)] text-sm text-[var(--sat-text-primary)] shrink-0">
      <span className="flex-1 text-xs leading-snug">
        File changed externally. Keep your edits or discard them?
      </span>
      <Button
        type="button"
        size="xs"
        onClick={onKeepMine}
        className="bg-[var(--sat-state-danger)] text-[var(--sat-text-inverse)] hover:opacity-90 border-transparent"
      >
        Keep mine
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={onDiscard}
        className="bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)] hover:bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)]"
      >
        Discard
      </Button>
    </div>
  );
}

function SaveIndicator({ status }: { status: string }) {
  const CONFIG: Record<string, { dot: string; label: string }> = {
    saved: { dot: "bg-[var(--sat-state-success)]", label: "Saved" },
    saving: {
      dot: "bg-[var(--sat-state-warning)] animate-pulse",
      label: "Saving…",
    },
    unsaved: { dot: "bg-[var(--sat-text-muted)]", label: "Unsaved" },
    conflict: {
      dot: "bg-[var(--sat-state-danger)] animate-pulse",
      label: "Conflict",
    },
  };

  const { dot, label } = CONFIG[status] ?? CONFIG.saved;

  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--sat-text-muted)] select-none">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarkdownLeaf — the registered "markdown" leaf type (ADR-018 Phase 2).
//
// Performance model:
//   - ONE EditorView for the whole session; documents are swapped via
//     view.setState() with a per-tab EditorState cache (undo history,
//     cursor and selection survive tab switches — no reload per switch).
//   - Typing causes ZERO React re-renders: the document lives in CM.
//   - Saves capture the doc from the CM state (not React state) and are
//     debounced; switching tabs flushes the previous tab first.
//   - Word/char stats are debounced, not O(n) per keystroke.
// ---------------------------------------------------------------------------

export function MarkdownLeaf({ tab }: LeafProps) {
  const services = useLeafServices();
  const io = useNoteIO();
  const keybindingService = useKeybindingService();

  const [menuState, setMenuState] = useState<ContextMenuState | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [view, setView] = useState<EditorView | null>(null);

  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef(new Map<string, EditorState>());
  const tabMetaRef = useRef(new Map<string, { path: string; name: string }>());
  const scrollRef = useRef(new Map<string, number>());
  const dirtyRef = useRef(new Set<string>());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTabRef = useRef<typeof tab | null>(null);
  /** Last write WE made — watcher events for it are our own echo. */
  const lastSelfSaveRef = useRef<{ path: string; at: number } | null>(null);

  const tabRef = useLatestRef(tab);
  const servicesRef = useLatestRef(services);
  const ioRef = useLatestRef(io);
  const setSaveStatusRef = useLatestRef(setSaveStatus);

  // ── Wikilink navigation — opens the target as a tab via services ────────

  const handleOpenLink = useCallback(
    (linkName: string) => {
      const s = servicesRef.current;
      const target =
        s.findNote(linkName) ?? s.findNote(`${linkName}.md`);
      if (target) {
        s.openNote({ name: target.name, path: target.path });
      } else {
        ioRef.current.setStatus(`Could not find linked note: "${linkName}"`);
      }
    },
    [ioRef, servicesRef],
  );

  // ── Extensions — built once; every EditorState uses this exact list ──────

  const extensions: Extension[] = useMemo(
    () => [
      ...createEditorExtensions({
        onFetchLinks: io.onFetchLinks,
        onFetchTags: io.onFetchTags,
        onOpenLink: handleOpenLink,
      }),
      contextMenuExtension(setMenuState),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return;
        const t = tabRef.current;
        if (!t) return;
        dirtyRef.current.add(t.id);
        servicesRef.current.markTabDirty(t.id, true);
        setSaveStatusRef.current("unsaved");
        scheduleSaveRef.current();
        scheduleStatsRef.current();
      }),
    ],
    // All deps are stable — this list must never change after mount.
    [],
  );
  const extensionsRef = useLatestRef(extensions);

  // ── Stats — debounced, computed from the CM doc, not React state ─────────

  const scheduleStatsRef = useRef<() => void>(() => {});
  scheduleStatsRef.current = () => {
    if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
    statsTimerRef.current = setTimeout(() => {
      const t = tabRef.current;
      const state = t ? statesRef.current.get(t.id) : undefined;
      if (!state) return;
      const text = state.doc.toString();
      const trimmed = text.trim();
      useFocusedPaneStore.getState().setStats({
        chars: text.length,
        words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length,
      });
    }, STATS_DEBOUNCE_MS);
  };

  // ── Save pipeline ────────────────────────────────────────────────────────

  const saveTab = useCallback(
    async (tabId: string) => {
      const meta = tabMetaRef.current.get(tabId);
      const state = statesRef.current.get(tabId);
      if (!meta || !state) return;

      const isActive = tabRef.current?.id === tabId;
      if (isActive) setSaveStatus("saving");
      // Tag the write BEFORE the await — the watcher echo can arrive before
      // the invoke promise resolves (separate IPC channels, unordered).
      lastSelfSaveRef.current = { path: meta.path, at: Date.now() };
      try {
        await ioRef.current.saveFile(meta.path, state.doc.toString());
        dirtyRef.current.delete(tabId);
        servicesRef.current.markTabDirty(tabId, false);
        if (isActive) {
          setSaveStatusRef.current("saved");
          void ioRef.current.refreshBacklinks(meta.path);
        }
      } catch (err) {
        console.error("[MarkdownLeaf] save_file failed:", err);
        ioRef.current.setStatus(`Save error: ${String(err)}`);
        if (isActive) setSaveStatusRef.current("unsaved");
      }
    },
    [ioRef, servicesRef, setSaveStatusRef, tabRef],
  );

  const scheduleSaveRef = useRef<() => void>(() => {});
  scheduleSaveRef.current = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const t = tabRef.current;
      if (t) void saveTab(t.id);
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  // ── Tab switching — doc swap, never remount ──────────────────────────────

  const showTab = useCallback(
    async (t: typeof tab) => {
      const view = viewRef.current;
      if (!view) return;
      tabMetaRef.current.set(t.id, { path: t.path, name: t.title });

      const cached = statesRef.current.get(t.id);
      if (cached) {
        view.setState(cached);
        view.scrollDOM.scrollTop = scrollRef.current.get(t.id) ?? 0;
        setSaveStatus(dirtyRef.current.has(t.id) ? "unsaved" : "saved");
        return;
      }

      setSaveStatus("saved");
      try {
        const text = await ioRef.current.readFile(t.path);
        // The user may have switched tabs while loading — only apply if
        // this tab is still the active one.
        if (tabRef.current?.id !== t.id) return;
        const state = EditorState.create({
          doc: text,
          extensions: extensionsRef.current,
        });
        statesRef.current.set(t.id, state);
        view.setState(state);
        view.scrollDOM.scrollTop = 0;
      } catch (err) {
        console.error("[MarkdownLeaf] open_file failed:", err);
        ioRef.current.setStatus(`Open error: ${String(err)}`);
      }
    },
    [extensionsRef, ioRef, tabRef],
  );

  useEffect(() => {
    // Depend on tab.id only — the tab object gets a new identity on every
    // tabs-store update (e.g. dirty flips) and this effect must not re-run.
    const t = tabRef.current;
    const prev = prevTabRef.current;
    const view = viewRef.current;
    if (!t) return;
    if (prev && prev.id !== t.id && view) {
      scrollRef.current.set(prev.id, view.scrollDOM.scrollTop);
      if (dirtyRef.current.has(prev.id)) void saveTab(prev.id);
    }
    prevTabRef.current = t;

    useFocusedPaneStore
      .getState()
      .setFocusedPaneSelected({ path: t.path, name: t.title });
    void ioRef.current.refreshBacklinks(t.path);
    void showTab(t);
  }, [tab.id, showTab, saveTab, ioRef, tabRef]);

  // ── View ready ───────────────────────────────────────────────────────────

  const handleReady = useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      setView(view);
      void showTab(tabRef.current);
    },
    [showTab, tabRef],
  );

  const initialState = useMemo(
    () => EditorState.create({ doc: "", extensions }),
    [extensions],
  );

  // ── Ctrl+S ───────────────────────────────────────────────────────────────

  useEffect(() => {
    keybindingService.registerAction("saveActiveFile", () => {
      const t = tabRef.current;
      if (t) void saveTab(t.id);
    });
    return () => keybindingService.unregisterAction("saveActiveFile");
  }, [keybindingService, saveTab, tabRef]);

  useEffect(() => {
    keybindingService.setContext("editorFocused", true);
    return () => keybindingService.setContext("editorFocused", false);
  }, [keybindingService]);

  // ── Flush on window blur / unmount ───────────────────────────────────────

  useEffect(() => {
    const onBlur = () => {
      const t = tabRef.current;
      if (t && dirtyRef.current.has(t.id)) void saveTab(t.id);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [saveTab, tabRef]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
      const t = tabRef.current;
      if (t && dirtyRef.current.has(t.id)) void saveTab(t.id);
    },
    [saveTab, tabRef],
  );

  // ── External file-change conflict detection ──────────────────────────────

  useEffect(() => {
    const unlistenPromise = listen<FileChangeEvent>(
      "vault://file-changed",
      async (event) => {
        const { path: changedPath, kind } = event.payload;
        const t = tabRef.current;
        if (!t || changedPath !== t.path) return;

        // Our own save echoed back by the watcher — ignore.
        const self = lastSelfSaveRef.current;
        if (
          kind !== "deleted" &&
          self &&
          self.path === changedPath &&
          Date.now() - self.at < 1500
        ) {
          return;
        }

        if (kind === "deleted") {
          ioRef.current.setStatus("! The open file was deleted from disk.");
          setSaveStatus("conflict");
          return;
        }

        if (dirtyRef.current.has(t.id)) {
          // Dirty + file changed. Could still be our own echo (raced past
          // the timestamp window) — only a REAL content difference between
          // disk and our document is a genuine conflict.
          const diskText = await ioRef.current.readFile(changedPath);
          const current = statesRef.current.get(t.id);
          if (current && current.doc.toString() === diskText) return;
          setConflict(true);
          ioRef.current.setStatus(
            "! File changed externally. Save or discard your changes.",
          );
        } else {
          // No unsaved edits — reload from disk, but only if the content
          // actually differs (our own echo / no-op writes must not nuke
          // the undo history).
          try {
            const text = await ioRef.current.readFile(changedPath);
            const current = statesRef.current.get(t.id);
            if (!current || current.doc.toString() === text) return;
            const state = EditorState.create({
              doc: text,
              extensions: extensionsRef.current,
            });
            statesRef.current.set(t.id, state);
            viewRef.current?.setState(state);
            setSaveStatus("saved");
          } catch (err) {
            console.error("[MarkdownLeaf] silent reload failed:", err);
            ioRef.current.setStatus(`Reload failed: ${String(err)}`);
          }
        }
      },
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [extensionsRef, ioRef, tabRef]);

  // ── Conflict actions ─────────────────────────────────────────────────────

  const handleKeepMine = useCallback(() => {
    const t = tabRef.current;
    if (!t) return;
    setConflict(false);
    void saveTab(t.id);
  }, [saveTab, tabRef]);

  const handleDiscard = useCallback(async () => {
    const t = tabRef.current;
    if (!t) return;
    try {
      const text = await ioRef.current.readFile(t.path);
      const state = EditorState.create({
        doc: text,
        extensions: extensionsRef.current,
      });
      statesRef.current.set(t.id, state);
      viewRef.current?.setState(state);
      dirtyRef.current.delete(t.id);
      servicesRef.current.markTabDirty(t.id, false);
      setSaveStatus("saved");
      setConflict(false);
      ioRef.current.setStatus(null);
    } catch (err) {
      console.error("[MarkdownLeaf] discardAndReload failed:", err);
    }
  }, [extensionsRef, ioRef, servicesRef, tabRef]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {conflict && (
        <ConflictBanner onKeepMine={handleKeepMine} onDiscard={handleDiscard} />
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--sat-layout-divider)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--sat-layout-divider)_70%,transparent)] hover:[&::-webkit-scrollbar-thumb]:bg-[var(--sat-layout-divider)]">
          <SaveIndicator status={saveStatus} />
          <EditorComponent
            initialState={initialState}
            onReady={handleReady}
            className="min-h-0 flex-1"
          />
        </div>
      </div>
      {io.status && (
        <div className="px-3 py-1 text-xs text-[var(--sat-text-muted)] shrink-0">
          {io.status}
        </div>
      )}
      <EditorContextMenu
        menuState={menuState}
        onMenuStateChange={setMenuState}
        view={view}
        onSearch={(query) => console.log("Searching for:", query)}
      />
    </>
  );
}
