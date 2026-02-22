import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FlatTreeNode, FileChangeEvent, LinkSuggestion, SaveStatus } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTOSAVE_DEBOUNCE_MS = 2000;

// ---------------------------------------------------------------------------
// Hook input / output types
// ---------------------------------------------------------------------------

export interface UseEditorOptions {
  /**
   * Resolver used by `handleOpenLink` to turn a wikilink target name into a
   * FlatTreeNode.  Injected so the hook stays decoupled from the tree state.
   */
  findNote: (name: string) => FlatTreeNode | undefined;
}

export interface UseEditorReturn {
  // ── State ────────────────────────────────────────────────────────────────
  selected: LinkSuggestion | null;
  content: string;
  backlinks: string[];
  saveStatus: SaveStatus;

  // ── Actions ──────────────────────────────────────────────────────────────
  /** Open a note: flush any pending save first, then load from disk. */
  loadNote: (note: LinkSuggestion) => Promise<void>;

  /** Called by the editor whenever its content changes. */
  handleChange: (value: string) => void;

  /** Flush a pending autosave immediately (e.g. on Ctrl+S). */
  performSave: () => Promise<void>;

  /**
   * Discard in-memory edits and reload the file from disk.
   * Used when an external conflict is detected.
   */
  discardAndReload: () => Promise<void>;

  // ── Editor autocomplete callbacks ────────────────────────────────────────
  onFetchLinks: (query: string) => Promise<LinkSuggestion[]>;
  onFetchTags: (query: string) => Promise<string[]>;

  /**
   * Called when the user clicks a `[[wikilink]]` in the editor.
   * Resolves the link name to a note and opens it.
   */
  handleOpenLink: (linkName: string) => void;

  // ── Status message (non-fatal informational / error text) ────────────────
  status: string | null;
  setStatus: (msg: string | null) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Owns all note-editing state: which note is open, its content, save status,
 * conflict detection, autosave debouncing, and editor autocomplete.
 *
 * Responsibilities:
 *   - Open / close notes
 *   - Autosave with debounce + immediate flush on Ctrl+S / window blur
 *   - Detect when a file is changed externally while there are unsaved edits
 *   - Provide autocomplete callbacks for the CodeMirror editor
 *
 * The hook intentionally knows nothing about the vault tree — it receives a
 * `findNote` resolver so it can handle wikilink navigation without coupling
 * to `useVaultTree`.
 */
export function useEditor({ findNote }: UseEditorOptions): UseEditorReturn {
  // ── Core state ────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<LinkSuggestion | null>(null);
  const [content, setContent] = useState("");
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [status, setStatus] = useState<string | null>(null);

  // ── Stable refs ───────────────────────────────────────────────────────────
  // Async callbacks (save, watcher) capture these refs so they always see the
  // latest values without being re-created on every render.
  const selectedRef = useRef<LinkSuggestion | null>(null);
  const contentRef = useRef("");
  const isDirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // ── Backlinks ─────────────────────────────────────────────────────────────

  const refreshBacklinks = useCallback(async (path: string) => {
    try {
      const links = await invoke<string[]>("get_backlinks", { path });
      setBacklinks(links);
    } catch (err) {
      console.error("[useEditor] get_backlinks failed:", err);
    }
  }, []);

  // ── Core save ─────────────────────────────────────────────────────────────

  const performSave = useCallback(async () => {
    const note = selectedRef.current;
    const text = contentRef.current;

    if (!note || !isDirtyRef.current) return;

    setSaveStatus("saving");
    try {
      await invoke("save_file", { path: note.path, content: text });
      isDirtyRef.current = false;
      setSaveStatus("saved");
      await refreshBacklinks(note.path);
    } catch (err) {
      console.error("[useEditor] save_file failed:", err);
      setStatus(`Save error: ${String(err)}`);
      setSaveStatus("unsaved");
    }
  }, [refreshBacklinks]);

  // ── Debounced autosave ────────────────────────────────────────────────────

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(performSave, AUTOSAVE_DEBOUNCE_MS);
  }, [performSave]);

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      isDirtyRef.current = true;
      setSaveStatus("unsaved");
      scheduleSave();
    },
    [scheduleSave],
  );

  // ── Ctrl+S — flush immediately ────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        performSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [performSave]);

  // ── Save on window blur ───────────────────────────────────────────────────

  useEffect(() => {
    const onBlur = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      performSave();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [performSave]);

  // ── External file-change conflict detection ───────────────────────────────
  //
  // The Rust watcher emits `vault://file-changed` for every .md mutation.
  // If the changed file happens to be the one currently open AND we have
  // unsaved edits, surface a conflict banner instead of silently clobbering
  // the user's work.

  useEffect(() => {
    const unlistenPromise = listen<FileChangeEvent>(
      "vault://file-changed",
      async (event) => {
        const { path: changedPath, kind } = event.payload;
        const current = selectedRef.current;

        if (!current || changedPath !== current.path) return;

        if (kind === "deleted") {
          // The open file was removed — surface a status message.
          setStatus("⚠ The open file was deleted from disk.");
          setSaveStatus("conflict");
          return;
        }

        if (isDirtyRef.current) {
          // We have unsaved edits and the file changed on disk — conflict.
          setSaveStatus("conflict");
          setStatus("⚠ File changed externally. Save or discard your changes.");
        } else {
          // No unsaved edits — silently reload from disk.
          try {
            const text = await invoke<string>("open_file", {
              path: changedPath,
            });
            setContent(text);
            contentRef.current = text;
            setSaveStatus("saved");
          } catch (err) {
            console.error("[useEditor] silent reload failed:", err);
          }
        }
      },
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // ── Load a note ───────────────────────────────────────────────────────────

  const loadNote = useCallback(
    async (note: LinkSuggestion) => {
      // Flush any pending autosave for the currently open note first.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await performSave();

      try {
        setStatus(`Opening ${note.name}…`);
        const text = await invoke<string>("open_file", { path: note.path });
        setSelected(note);
        setContent(text);
        contentRef.current = text;
        isDirtyRef.current = false;
        setSaveStatus("saved");
        await refreshBacklinks(note.path);
        setStatus(null);
      } catch (err) {
        console.error("[useEditor] open_file failed:", err);
        setStatus(`Open error: ${String(err)}`);
      }
    },
    [performSave, refreshBacklinks],
  );

  // ── Discard conflict and reload from disk ─────────────────────────────────

  const discardAndReload = useCallback(async () => {
    const note = selectedRef.current;
    if (!note) return;
    try {
      const text = await invoke<string>("open_file", { path: note.path });
      setContent(text);
      contentRef.current = text;
      isDirtyRef.current = false;
      setSaveStatus("saved");
      setStatus(null);
    } catch (err) {
      console.error("[useEditor] discardAndReload failed:", err);
    }
  }, []);

  // ── Editor autocomplete ───────────────────────────────────────────────────

  const onFetchLinks = useCallback(async (query: string): Promise<LinkSuggestion[]> => {
    try {
      return await invoke<LinkSuggestion[]>("autocomplete_links", {
        prefix: query,
      });
    } catch {
      return [];
    }
  }, []);

  const onFetchTags = useCallback(async (query: string): Promise<string[]> => {
    try {
      return await invoke<string[]>("autocomplete_tags", { prefix: query });
    } catch {
      return [];
    }
  }, []);

  // ── Wikilink navigation ───────────────────────────────────────────────────

  const handleOpenLink = useCallback(
    (linkName: string) => {
      const target = findNote(linkName) ?? findNote(`${linkName}.md`);
      if (target) {
        loadNote({ name: target.name, path: target.path });
      } else {
        setStatus(`Could not find linked note: "${linkName}"`);
      }
    },
    [findNote, loadNote],
  );

  return {
    selected,
    content,
    backlinks,
    saveStatus,
    status,
    setStatus,
    loadNote,
    handleChange,
    performSave,
    discardAndReload,
    onFetchLinks,
    onFetchTags,
    handleOpenLink,
  };
}
