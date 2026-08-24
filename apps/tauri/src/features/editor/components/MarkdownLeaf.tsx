import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { commandService } from "@workspace/commands";
import {
  type BenchmarkReportRow,
  type ContextMenuState,
  contextMenuExtension,
  createEditorExtensionGroups,
  createEditorExtensions,
  editorBenchmarkState,
  formatBenchmarkReport,
  runIsolationBenchmark,
  runTypingBenchmark,
} from "@workspace/editor";
import { useKeybindingService } from "@workspace/keybindings";
import { Button } from "@workspace/ui/components/ui/button";
import { type LeafProps, useLeafServices } from "@workspace/views";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileChangeEvent, SaveStatus } from "../../vault/types";
import { useLatestRef } from "../hooks/useLatestRef";
import { useNoteIO } from "../hooks/useNoteIO";
import { useFocusedPaneStore } from "../store";
import { EditorComponent } from "./EditorComponent";
import { EditorContextMenu } from "./EditorContextMenu";

const AUTOSAVE_DEBOUNCE_MS = 2000;
const STATS_DEBOUNCE_MS = 500;

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

/**
 * Registered "markdown" leaf (ADR-018 Phase 2). One EditorView per session;
 * documents are swapped via setState() with a per-tab EditorState cache, so
 * undo history, cursor, and scroll survive tab switches. Typing never
 * re-renders React — the doc lives in CM6. Saves capture the doc from CM
 * state (debounced; a tab switch flushes the previous tab first). Word/char
 * stats are debounced, never O(n) per keystroke.
 */
export function MarkdownLeaf({ tab }: LeafProps) {
  const services = useLeafServices();
  const io = useNoteIO();
  const keybindingService = useKeybindingService();

  const [menuState, setMenuState] = useState<ContextMenuState | null>(null);
  const [conflict, setConflict] = useState(false);
  // Write-only for now: the visual indicator is disabled so saves never
  // trigger a React re-render in the typing path. Status strings surface
  // through io.setStatus instead.
  const [, setSaveStatus] = useState<SaveStatus>("saved");
  const [view, setView] = useState<EditorView | null>(null);

  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef(new Map<string, EditorState>());
  const tabMetaRef = useRef(new Map<string, { path: string; name: string }>());
  const scrollRef = useRef(new Map<string, number>());
  const dirtyRef = useRef(new Set<string>());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTabRef = useRef<typeof tab | null>(null);

  const tabRef = useLatestRef(tab);
  const servicesRef = useLatestRef(services);
  const ioRef = useLatestRef(io);
  const setSaveStatusRef = useLatestRef(setSaveStatus);

  const handleOpenLink = useCallback(
    (linkName: string) => {
      const s = servicesRef.current;
      const target = s.findNote(linkName) ?? s.findNote(`${linkName}.md`);
      if (target) {
        s.openNote({ name: target.name, path: target.path });
      } else {
        ioRef.current.setStatus(`Could not find linked note: "${linkName}"`);
      }
    },
    [ioRef, servicesRef],
  );

  // Built once — every EditorState (initial, per-tab, conflict reload) must
  // use this exact list.
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
        // Benchmark dispatches must not mark tabs dirty, schedule saves,
        // or pollute stats — the benchmark restores the doc itself.
        if (editorBenchmarkState.active) return;
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

  // Stats are debounced and computed from the CM doc, not React state.
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

  const saveTab = useCallback(
    async (tabId: string) => {
      const meta = tabMetaRef.current.get(tabId);
      const state = statesRef.current.get(tabId);
      if (!meta || !state) return;

      const isActive = tabRef.current?.id === tabId;
      if (isActive) setSaveStatus("saving");
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

  // Doc swap, never remount.
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

  // Dev: editor typing benchmark (ADR-017 frontend counterpart). Results go
  // to a temp file via write_dev_report so prod runs need NO devtools open
  // (devtools inflate measurements 2–5×); console output is a convenience
  // copy only.
  useEffect(() => {
    if (!view) return;

    const report = async (title: string, rows: BenchmarkReportRow[]) => {
      console.table(rows);
      const md = formatBenchmarkReport(title, rows);
      try {
        const path = await invoke<string>("write_dev_report", {
          fileName: "editor-benchmark.md",
          contents: md,
        });
        ioRef.current.setStatus(`Benchmark written to ${path}`);
      } catch (err) {
        console.error("[MarkdownLeaf] report write failed:", err);
        ioRef.current.setStatus(
          "Benchmark done; report write failed (see console)",
        );
      }
    };

    commandService.registerCommand("dev:editor-benchmark", () => {
      try {
        void report(
          "Editor typing benchmark — full extension stack",
          runTypingBenchmark(view),
        );
      } catch (err) {
        console.error("[MarkdownLeaf] benchmark failed:", err);
      }
    });

    commandService.registerCommand("dev:editor-benchmark-isolation", () => {
      try {
        // Fresh groups per run — never share plugin instances with states
        // other than the ones they were built for.
        const g = createEditorExtensionGroups({
          onFetchLinks: io.onFetchLinks,
          onFetchTags: io.onFetchTags,
          onOpenLink: handleOpenLink,
        });
        const full = [
          ...g.base,
          ...g.syntax,
          ...g.input,
          ...g.livePreview,
          ...g.suggestions,
          ...g.links,
        ];
        const results = runIsolationBenchmark(view, [
          { name: "base", extensions: g.base },
          { name: "+syntax", extensions: [...g.base, ...g.syntax] },
          { name: "+input", extensions: [...g.base, ...g.input] },
          { name: "+live-preview", extensions: [...g.base, ...g.livePreview] },
          { name: "+suggestions", extensions: [...g.base, ...g.suggestions] },
          { name: "+links", extensions: [...g.base, ...g.links] },
          { name: "full", extensions: full },
        ]);
        void report("Editor typing benchmark — extension isolation", results);
      } catch (err) {
        console.error("[MarkdownLeaf] isolation benchmark failed:", err);
      }
    });

    return () => {
      commandService.unregister("dev:editor-benchmark");
      commandService.unregister("dev:editor-benchmark-isolation");
    };
  }, [view, io, ioRef, handleOpenLink]);

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

  // External file-change reconciliation. With self-write suppression in Rust,
  // events reaching this handler are external by contract — but the content
  // diff remains the only arbiter (vim FileChangedShell model): duplicate OS
  // events, marker misses, or no-op touches must never surface as conflicts
  // or destroy undo history.
  //   disk == doc        → echo / no-op → ignore
  //   disk != doc, dirty → concurrent edit → conflict banner
  //   disk != doc, clean → external edit → reload from disk
  useEffect(() => {
    const unlistenPromise = listen<FileChangeEvent>(
      "vault://file-changed",
      async (event) => {
        const { path: changedPath, kind } = event.payload;
        const t = tabRef.current;
        if (!t || changedPath !== t.path) return;

        if (kind === "deleted") {
          ioRef.current.setStatus("! The open file was deleted from disk.");
          setSaveStatus("conflict");
          return;
        }

        let diskText: string;
        try {
          diskText = await ioRef.current.readFile(changedPath);
        } catch (err) {
          console.error("[MarkdownLeaf] reconcile read failed:", err);
          return;
        }

        const current = statesRef.current.get(t.id);
        if (!current || current.doc.toString() === diskText) return;

        if (dirtyRef.current.has(t.id)) {
          setConflict(true);
          ioRef.current.setStatus(
            "! File changed externally. Save or discard your changes.",
          );
        } else {
          const state = EditorState.create({
            doc: diskText,
            extensions: extensionsRef.current,
          });
          statesRef.current.set(t.id, state);
          viewRef.current?.setState(state);
          setSaveStatus("saved");
        }
      },
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [extensionsRef, ioRef, tabRef]);

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

  return (
    <>
      {conflict && (
        <ConflictBanner onKeepMine={handleKeepMine} onDiscard={handleDiscard} />
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--sat-layout-divider)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--sat-layout-divider)_70%,transparent)] hover:[&::-webkit-scrollbar-thumb]:bg-[var(--sat-layout-divider)]">
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
