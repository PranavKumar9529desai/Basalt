import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  type ContextMenuState,
  type FrontmatterModel,
  contextMenuExtension,
  createEditorExtensions,
  editorBenchmarkState,
} from "@workspace/editor";
import { useKeybindingService } from "@workspace/keybindings";
import type { LeafServices, LeafTabInfo } from "@workspace/views";
import type { LinkSuggestion, SaveStatus } from "../../vault/types";
import { pruneClosedTabCaches } from "../logic/pruneCache";
import { editFrontmatter, initFrontmatterWasm } from "../logic/frontmatter";
import { useActiveNoteStore } from "../store/activeNote";
import { AUTOSAVE_DEBOUNCE_MS } from "../logic/saveManager";
import { computeStats } from "../logic/stats";

/** Debounce for word/char stats — computed from the CM doc, never per keystroke. */
const STATS_DEBOUNCE_MS = 500;

/**
 * The note I/O surface the controller talks to — a structural subset of
 * `useNoteIO`'s return (the persistence paths plus the two setters that
 * carry strings out of CM into UI state). Keeping this an interface (rather
 * than importing the hook) means the controller stays testable without
 * React: a fake `NoteIO` is a plain object.
 */
export interface NoteIO {
  readFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<unknown>;
  refreshBacklinks: (path: string) => Promise<void>;
  setStatus: (status: string | null) => void;
  setSaveStatus: (status: SaveStatus) => void;
  onFetchLinks: (query: string) => Promise<LinkSuggestion[]>;
  onFetchTags: (query: string) => Promise<string[]>;
  parseFrontmatter: (text: string) => FrontmatterModel | null;
}

export interface EditorControllerOptions {
  io: NoteIO;
  services: LeafServices;
  keybindingService: ReturnType<typeof useKeybindingService>;
  currentTab: LeafTabInfo | null;
  setContextMenuState: (state: ContextMenuState | null) => void;
  onStatus: (status: string | null) => void;
  /** Notifies the leaf when a tab document has been loaded or reloaded. */
  onDocumentReady?: () => void;
}

/**
 * Single owner of the EditorView and the per-tab caching layer.
 *
 * Why caches, and why a class:
 * - Tabs must survive switches with undo history, cursor, and scroll intact.
 *   That state is deliberately kept OUT of React — the document lives in CM
 *   and typing must never re-render the leaf (the 16ms latency budget).
 * - The per-tab `EditorState` cache is a Map keyed by tab id. Dropping closed
 *   tabs' entries prevents closed documents (full text + undo history) from
 *   lingering until a remount; dirty ones are flush-saved first so a forced
 *   close never loses edits.
 * - Saves and stats always read the cache's current state, never a stale
 *   snapshot, so a save can't "succeed" while persisting pre-edit content.
 *
 * The extension list is built exactly once, here in the constructor. Every
 * state the controller creates afterwards (initial, per-tab, conflict reload)
 * MUST reuse these exact extensions — CM rethrows when a view's state was
 * created with a different extension set, so this is an invariant, not a
 * preference.
 */
export class EditorController {
  /** Empty-doc state for Host's one-time mount. */
  readonly initialState: EditorState;
  readonly services: LeafServices;
  readonly io: NoteIO;
  readonly keybindingService: ReturnType<typeof useKeybindingService>;
  readonly onTabChanged?: () => void;
  readonly onDocumentReady?: () => void;

  private view: EditorView | null = null;
  private currentTab: LeafTabInfo | null;
  private statesRef: Map<string, EditorState> = new Map();
  private tabMetaRef = new Map<string, { path: string; name: string }>();
  private scrollRef = new Map<string, number>();
  private dirtyRef = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setTimeout> | null = null;

  private extensions: Extension[];

  constructor(options: EditorControllerOptions) {
    this.io = options.io;
    this.services = options.services;
    this.keybindingService = options.keybindingService;
    this.currentTab = options.currentTab;
    this.onDocumentReady = options.onDocumentReady;

    const updateListener = EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      // Benchmark dispatches must not mark tabs dirty, schedule saves,
      // or pollute stats — the benchmark restores the doc itself.
      if (editorBenchmarkState.active) return;
      const t = this.currentTab;
      if (!t) return;
      // Sync the per-tab cache with the edited state. Saves and stats read
      // from the cache — without this they'd write/compute against the
      // pre-edit doc (save "succeeds" but persists stale content).
      this.statesRef.set(t.id, u.state);
      this.dirtyRef.add(t.id);
      this.services.markTabDirty(t.id, true);
      this.io.setSaveStatus("unsaved");
      this.scheduleSave();
      this.scheduleStats();
    });

    const extensions: Extension[] = [
      ...createEditorExtensions({
        onFetchLinks: options.io.onFetchLinks,
        onFetchTags: options.io.onFetchTags,
        onOpenLink: this.handleOpenLink,
        parseFrontmatter: options.io.parseFrontmatter,
        editFrontmatter,
      }),
      contextMenuExtension(options.setContextMenuState),
      updateListener,
    ];

    this.extensions = extensions;
    this.initialState = EditorState.create({ doc: "", extensions });
  }

  handleOpenLink = (linkName: string) => {
    const target =
      this.services.findNote(linkName) ??
      this.services.findNote(`${linkName}.md`);
    if (target) {
      this.services.openNote(target.path);
    } else {
      this.io.setStatus(`Could not find linked note: "${linkName}"`);
    }
  };

  /** Set the live view (called once Host reports its EditorView). */
  setView(view: EditorView) {
    this.view = view;
    if (this.currentTab) void this.showTab(this.currentTab);
  }

  /** The live EditorView, if the host has reported it yet. */
  getView(): EditorView | null {
    return this.view;
  }

  /** Return focus to the note body after the title submits. */
  focusBody = (anchor = 0) => {
    const view = this.view;
    if (!view) return;
    requestAnimationFrame(() => {
      view.dispatch({ selection: { anchor } });
      view.focus();
    });
  };

  /** Current active tab (normally passed by the component on changes). */
  setCurrentTab(tab: LeafTabInfo | null) {
    this.currentTab = tab;
  }

  activeTab(): LeafTabInfo | null {
    return this.currentTab;
  }

  getDirtyIds(): Set<string> {
    return this.dirtyRef;
  }

  isDirty(tabId: string): boolean {
    return this.dirtyRef.has(tabId);
  }

  getCachedDocText(tabId: string): string {
    return this.statesRef.get(tabId)?.doc.toString() ?? "";
  }

  /**
   * Switch the active document. Displays the cached state when the tab was
   * seen before (restoring its scroll offset); otherwise reads the file from
   * disk and builds a fresh state. This is a swap via `view.setState()`,
   * never a remount.
   */
  async showTab(t: LeafTabInfo) {
    const view = this.view;
    if (!view) return;
    this.tabMetaRef.set(t.id, { path: t.path, name: t.title });

    const cached = this.statesRef.get(t.id);
    if (cached) {
      view.setState(cached);
      this.onDocumentReady?.();
      view.scrollDOM.scrollTop = this.scrollRef.get(t.id) ?? 0;
      this.io.setSaveStatus(this.isDirty(t.id) ? "unsaved" : "saved");
      if (t.line) this.revealLine(t.line);
      if (t.focusOnOpen) this.focusBody(view.state.selection.main.head);
      return;
    }

    this.io.setSaveStatus("saved");
    try {
      // Boot race: the parse runs synchronously inside EditorState.create
      // (an empty doc parses to null). Awaiting the WASM load first means no
      // frontmatter note ever renders in the dim fallback before its panel.
      const [text] = await Promise.all([
        this.io.readFile(t.path),
        initFrontmatterWasm(),
      ]);
      // The user may have switched tabs while loading — only apply if this
      // tab is still the active one.
      if (this.currentTab?.id !== t.id) return;
      const state = EditorState.create({
        doc: text,
        extensions: this.extensions,
      });
      this.statesRef.set(t.id, state);
      view.setState(state);
      this.onDocumentReady?.();
      view.scrollDOM.scrollTop = 0;
      if (t.line) this.revealLine(t.line);
    } catch (err) {
      console.error("[EditorView] open_file failed:", err);
      this.io.setStatus(`Open error: ${String(err)}`);
    }
  }

  /** Reveal a 1-based line in the active editor (search jump-to-line). */
  revealLine(line: number) {
    const view = this.view;
    if (!view) return;
    const total = view.state.doc.lines;
    if (total === 0) return;
    const target = view.state.doc.line(Math.max(1, Math.min(line, total)));
    view.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const t = this.currentTab;
      if (t) void this.saveTab(t.id);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  scheduleStats() {
    if (this.statsTimer) clearTimeout(this.statsTimer);
    this.statsTimer = setTimeout(() => {
      this.statsTimer = null;
      const t = this.currentTab;
      const state =
        this.view?.state ?? (t ? this.statesRef.get(t.id) : undefined);
      if (!state) return;
      useActiveNoteStore.getState().setStats(computeStats(state.doc.toString()));
    }, STATS_DEBOUNCE_MS);
  }

  /**
   * Persist one tab. The live tab is the source of truth for the path: a
   * move can repoint a tab's path in place (stable id), and `tabMetaRef`
   * may still hold the pre-move snapshot for background tabs.
   */
  async saveTab(tabId: string) {
    const liveTab = this.currentTab;
    const isActive = liveTab?.id === tabId;
    const meta =
      isActive && liveTab
        ? { path: liveTab.path, name: liveTab.title }
        : this.tabMetaRef.get(tabId);
    if (!meta) return;

    const state =
      (isActive ? this.view?.state : undefined) ?? this.statesRef.get(tabId);
    if (!state) return;
    // Capture the live state NOW: a subsequent transaction must not let this
    // save persist a newer doc than the one being written.
    if (isActive) this.statesRef.set(tabId, this.view!.state);

    if (isActive) this.io.setSaveStatus("saving");
    try {
      await this.io.saveFile(meta.path, state.doc.toString());
      this.dirtyRef.delete(tabId);
      this.services.markTabDirty(tabId, false);
      if (isActive) {
        this.io.setSaveStatus("saved");
        void this.io.refreshBacklinks(meta.path);
      }
    } catch (err) {
      console.error("[EditorView] save_file failed:", err);
      this.io.setStatus(`Save error: ${String(err)}`);
      if (isActive) this.io.setSaveStatus("unsaved");
    }
  }

  /** Save the tab only if it has unsaved edits (blur/unmount guards). */
  flushIfDirty(tabId: string) {
    if (this.dirtyRef.has(tabId)) void this.saveTab(tabId);
  }

  /** Reset a fair-sleep timer so a manual save doesn't double-fire. */
  cancelScheduledSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * Reload the active tab from disk, discarding local edits ("Discard"
   * conflict path). The event that triggered the banner read the file
   * already, but we re-read here so the state always reflects the latest
   * disk content, not a snapshot.
   */
  async reloadActiveFromDisk() {
    const t = this.currentTab;
    const view = this.view;
    if (!t || !view) return;
    try {
      const text = await this.io.readFile(t.path);
      const state = EditorState.create({
        doc: text,
        extensions: this.extensions,
      });
      this.statesRef.set(t.id, state);
      view.setState(state);
      this.onDocumentReady?.();
      this.dirtyRef.delete(t.id);
      this.services.markTabDirty(t.id, false);
      this.io.setSaveStatus("saved");
      this.io.setStatus(null);
      this.cancelScheduledSave();
    } catch (err) {
      console.error("[EditorView] discardAndReload failed:", err);
    }
  }

  /**
   * Forget caches for tabs that are no longer open, flushing dirty ones
   * first. Prune-on-close keeps closed tabs' full EditorStates from
   * lingering; `pruneClosedTabCaches` carries the path-aware move safety.
   */
  prune() {
    pruneClosedTabCaches<EditorState>(
      {
        states: this.statesRef,
        scroll: this.scrollRef,
        dirty: this.dirtyRef,
        tabMeta: this.tabMetaRef,
      },
      {
        getOpenTabIds: () => this.services.getOpenTabIds(),
        getOpenTabPaths: () => this.services.getOpenTabPaths(),
        getTabInfo: (id) => this.services.getTabInfo(id),
      },
      (id) => void this.saveTab(id),
    );
  }

  /** Release the view and timers (unmount). */
  destroy() {
    this.cancelScheduledSave();
    if (this.statsTimer) {
      clearTimeout(this.statsTimer);
      this.statsTimer = null;
    }
    this.view?.destroy();
    this.view = null;
  }
}
