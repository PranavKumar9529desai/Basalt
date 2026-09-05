import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { commandService } from "@workspace/commands";
import {
  type BenchmarkReportRow,
  type ContextMenuState,
  clearQueryCache,
  createEditorExtensionGroups,
  formatBenchmarkReport,
  formatWatchdogReport,
  getWatchdogStats,
  requestPreviewRebuild,
  runIsolationBenchmark,
  runTypingBenchmark,
  startWatchdog,
  stopWatchdog,
} from "@workspace/editor";
import { useKeybindingService } from "@workspace/keybindings";
import { type LeafProps, useLeafServices } from "@workspace/views";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileChangeEvent } from "../../vault/types";
import { useLatestRef } from "./useLatestRef";
import { useNoteIO } from "./useNoteIO";
import {
  EditorController,
  type EditorControllerOptions,
} from "../controller/EditorController";
import { decideReconcileAction } from "../lib/reconcile";
import { editorControllerRegistry } from "../registry";
import { useActiveNoteStore } from "../store/activeNote";
import { useRenameSignalStore } from "../store/renameSignal";

/**
 * Orchestrates the Markdown editor leaf: constructs the controller once,
 * carries the few bits of true React state (context menu, conflict banner,
 * the live EditorView handle), and wires the effects that trigger off tab
 * changes and window lifecycle.
 *
 * The typing hot path must never touch React — the controller owns the
 * update listener and all per-tab caches; this hook only observes tab-level
 * events (switch, close, blur, unmount, external file change).
 */
export function useEditor(
  tab: LeafProps["tab"],
  paneId: LeafProps["paneId"],
) {
  const services = useLeafServices();
  const io = useNoteIO();
  const keybindingService = useKeybindingService();

  const [menuState, setMenuState] = useState<ContextMenuState | null>(null);
  const [conflict, setConflict] = useState(false);
  const [view, setView] = useState<EditorView | null>(null);
  const [documentRevision, setDocumentRevision] = useState(0);
  const tabRef = useLatestRef(tab);
  const servicesRef = useLatestRef(services);
  const ioRef = useLatestRef(io);
  const viewRef = useLatestRef(view);

  // Constructed once per mount. Re-construction on every render would
  // rebuild the extension list, and every EditorState created after that
  // MUST share the exact same extensions (CM rethrows otherwise).
  // The tab argument is the mount-time tab — the controller re-targets via
  // setCurrentTab on every subsequent tab change, so fresh tabs are never
  // read from this initial value.
  const controllerRef = useRef<EditorController | null>(null);
  if (!controllerRef.current) {
    const options: EditorControllerOptions = {
      io,
      services,
      keybindingService,
      currentTab: tab,
      setContextMenuState: setMenuState,
      onStatus: io.setStatus,
      onDocumentReady: () => setDocumentRevision((revision) => revision + 1),
    };
    controllerRef.current = new EditorController(options);
  }
  const controller = controllerRef.current;

  // Register this pane's controller in the global registry for the app's
  // lifetime of the pane. Global commands/actions resolve the active pane's
  // controller at EXECUTION time from here — never capture a per-pane
  // controller in a closure registered elsewhere. Unregister is keyed by
  // paneId, so an unmounting pane can only ever remove its own entry.
  useEffect(() => {
    editorControllerRegistry.register(paneId, controller);
    return () => editorControllerRegistry.unregister(paneId);
  }, [paneId, controller]);

  // Tab changes: capture the outgoing tab's scroll, flush its unsaved
  // edits, then show the new tab (cached state or disk read).
  useEffect(() => {
    const t = tabRef.current;
    const view_ = controller.getView();

    // Outgoing tab (still held by the controller from the previous run),
    // if different from the incoming one — flush its edits before the
    // autosave timer gets re-scheduled for the new tab.
    const prev = controller.activeTab();
    if (prev && prev.id !== t.id && view_) {
      controller.flushIfDirty(prev.id);
    }

    controller.setCurrentTab(t);

    useActiveNoteStore
      .getState()
      .setActiveNote({ path: t.path, name: t.title });
    void ioRef.current.refreshBacklinks(t.path);
    void controller.showTab(t);
  }, [tab.id, tab.path, tab.line, controller, tabRef, ioRef]);

  const handleReady = useCallback(
    (view: EditorView) => {
      setView(view);
      controller.setView(view);
    },
    [controller],
  );

  // Prune per-tab caches when tabs close. Without this, closed tabs'
  // EditorStates (full documents + undo history) linger until remount.
  // Dirty tabs flush-save BEFORE their state is dropped: closeTab(force)
  // doesn't save, and the autosave timer only covers the active tab.
  useEffect(() => {
    return servicesRef.current.onTabStructureChanged(() => controller.prune());
  }, [servicesRef, controller]);

  useEffect(() => {
    keybindingService.registerAction("saveActiveFile", () => {
      const t = tabRef.current;
      if (t) void controller.saveTab(t.id);
    });
    return () => keybindingService.unregisterAction("saveActiveFile");
  }, [keybindingService, controller, tabRef]);

  useEffect(() => {
    // F2 (and any chrome-level "rename note" affordance): hand the active
    // tab's id to the rename signal; the inline title reacts and enters
    // edit mode. No direct editor access here — the title owns rename state.
    keybindingService.registerAction("renameActiveNote", () => {
      const t = tabRef.current;
      if (t) useRenameSignalStore.getState().request(t.id);
    });
    return () => keybindingService.unregisterAction("renameActiveNote");
  }, [keybindingService, tabRef]);

  // Dev: editor typing benchmark. Results go to a temp file via
  // write_dev_report so prod runs need NO devtools open (devtools inflate
  // measurements 2–5×); console output is a convenience copy only.
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
        console.error("[EditorView] report write failed:", err);
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
        console.error("[EditorView] benchmark failed:", err);
      }
    });

    commandService.registerCommand("dev:editor-benchmark-isolation", () => {
      try {
        // Fresh groups per run — never share plugin instances with states
        // other than the ones they were built for.
        const g = createEditorExtensionGroups({
          onFetchLinks: io.onFetchLinks,
          onFetchTags: io.onFetchTags,
          onOpenLink: controller.handleOpenLink,
          parseFrontmatter: io.parseFrontmatter,
          runQuery: io.runQuery,
        });
        const full = [
          ...g.base,
          ...g.syntax,
          ...g.input,
          ...g.livePreview,
          ...g.suggestions,
          ...g.links,

          ...g.blockWidgets,
        ];
        const results = runIsolationBenchmark(view, [
          { name: "base", extensions: g.base },
          { name: "+syntax", extensions: [...g.base, ...g.syntax] },
          { name: "+input", extensions: [...g.base, ...g.input] },
          { name: "+live-preview", extensions: [...g.base, ...g.livePreview] },
          { name: "+suggestions", extensions: [...g.base, ...g.suggestions] },
          { name: "+links", extensions: [...g.base, ...g.links] },

          {
            name: "+block-widgets",
            extensions: [...g.base, ...g.blockWidgets],
          },
          { name: "full", extensions: full },
        ]);
        void report("Editor typing benchmark — extension isolation", results);
      } catch (err) {
        console.error("[EditorView] isolation benchmark failed:", err);
      }
    });

    // Dev: main-thread watchdog. Toggle on/off; report writes to temp file.
    let watchdogActive = false;
    commandService.registerCommand("dev:watchdog", () => {
      if (watchdogActive) {
        stopWatchdog();
        watchdogActive = false;
        ioRef.current.setStatus("Watchdog stopped");
      } else {
        startWatchdog(100);
        watchdogActive = true;
        ioRef.current.setStatus("Watchdog started (100ms threshold)");
      }
    });
    commandService.registerCommand("dev:watchdog-report", async () => {
      const s = getWatchdogStats();
      const md = formatWatchdogReport(s);
      try {
        const path = await invoke<string>("write_dev_report", {
          fileName: "watchdog-report.md",
          contents: md,
        });
        ioRef.current.setStatus(`Watchdog report written to ${path}`);
      } catch (err) {
        console.error("[EditorView] watchdog report write failed:", err);
        ioRef.current.setStatus("Watchdog report failed (see console)");
      }
    });

    return () => {
      commandService.unregister("dev:editor-benchmark");
      commandService.unregister("dev:editor-benchmark-isolation");
      commandService.unregister("dev:watchdog");
      commandService.unregister("dev:watchdog-report");
      if (watchdogActive) stopWatchdog();
    };
  }, [view, io, ioRef, controller]);

  // Window blur: flush the active tab's edits so focus loss never strands
  // work the autosave timer hadn't reached yet.
  useEffect(() => {
    const onBlur = () => {
      const t = tabRef.current;
      if (t) controller.flushIfDirty(t.id);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [controller, tabRef]);

  // Unmount: stop timers and flush any remaining unsaved edits — a forced
  // close must never lose the user's work.
  useEffect(
    () => () => {
      const t = tabRef.current;
      if (t) controller.flushIfDirty(t.id);
      controller.destroy();
    },
    [controller, tabRef],
  );

  // External file-change reconciliation. With self-write suppression in
  // Rust, events reaching this handler are external by contract — but the
  // content diff remains the only arbiter (vim FileChangedShell model):
  // duplicate OS events, marker misses, or no-op touches must never surface
  // as conflicts or destroy undo history.
  //   disk == doc        → echo / no-op → ignore
  useEffect(() => {
    const unlistenPromise = listen<FileChangeEvent>(
      "vault://file-changed",
      async (event) => {
        const { path: changedPath, kind } = event.payload;
        // Any external vault change can alter DQL query results regardless of
        // which file changed — drop the widget cache and re-render the active
        // view so dql blocks show fresh results.
        clearQueryCache();
        const currentView = viewRef.current;
        if (currentView) requestPreviewRebuild(currentView);
        const active = tabRef.current;
        if (!active || changedPath !== active.path) return;

        if (kind === "deleted") {
          ioRef.current.setStatus("! The open file was deleted from disk.");
          io.setSaveStatus("conflict");
          return;
        }

        let diskText: string;
        try {
          diskText = await ioRef.current.readFile(changedPath);
        } catch (err) {
          console.error("[EditorView] reconcile read failed:", err);
          return;
        }

        const currentDoc = controller.getCachedDocText(active.id);
        const action = decideReconcileAction(
          currentDoc,
          diskText,
          controller.isDirty(active.id),
        );

        if (action === "ignore") return;
        if (action === "conflict") {
          setConflict(true);
          ioRef.current.setStatus(
            "! File changed externally. Save or discard your changes.",
          );
          return;
        }
        // clean → reload from disk (the controller resets save status).
        await controller.reloadActiveFromDisk();
        setConflict(false);
      },
    );

    return () => {
      // If listen() itself rejected there is nothing to unlisten.
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [controller, tabRef, ioRef, io, viewRef]);

  const handleKeepMine = useCallback(() => {
    const t = tabRef.current;
    if (!t) return;
    setConflict(false);
    void controller.saveTab(t.id);
  }, [controller, tabRef]);

  const handleDiscard = useCallback(async () => {
    await controller.reloadActiveFromDisk();
    setConflict(false);
  }, [controller]);

  return {
    controller,
    io,
    services,
    view,
    menuState,
    setMenuState,
    conflict,
    handleReady,
    handleKeepMine,
    handleDiscard,
    documentRevision,
  };
}
