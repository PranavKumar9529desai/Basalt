import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Editor } from "@workspace/editor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LinkSuggestion = { name: string; path: string };
type SaveStatus = "saved" | "saving" | "unsaved" | "conflict";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTOSAVE_DEBOUNCE_MS = 2000;

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

// ---------------------------------------------------------------------------
// Save status indicator
// ---------------------------------------------------------------------------

function SaveIndicator({ status }: { status: SaveStatus }) {
  const configs: Record<SaveStatus, { dot: string; label: string }> = {
    saved: { dot: "bg-green-500", label: "Saved" },
    saving: { dot: "bg-yellow-400 animate-pulse", label: "Saving…" },
    unsaved: { dot: "bg-blue-400", label: "Unsaved changes" },
    conflict: {
      dot: "bg-red-500 animate-pulse",
      label: "Conflict — file changed externally",
    },
  };
  const { dot, label } = configs[status];
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400 select-none">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function RouteComponent() {
  // ── Vault / notes ─────────────────────────────────────────────────────────
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [vaultInput, setVaultInput] = useState("");
  const [notes, setNotes] = useState<LinkSuggestion[]>([]);
  const [noteFilter, setNoteFilter] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);

  // ── Currently open note ────────────────────────────────────────────────────
  const [selected, setSelected] = useState<LinkSuggestion | null>(null);
  const [content, setContent] = useState("");
  const [backlinks, setBacklinks] = useState<string[]>([]);

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  // ── Status bar ─────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<string | null>(null);

  // ── Stable refs so callbacks never go stale ────────────────────────────────
  const selectedRef = useRef(selected);
  const contentRef = useRef(content);
  const isDirtyRef = useRef(false); // true when content !== last-saved
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // ── Filtered note list ─────────────────────────────────────────────────────
  const filteredNotes = useMemo(() => {
    const f = noteFilter.trim().toLowerCase();
    if (!f) return notes;
    return notes.filter((n) => n.name.toLowerCase().includes(f));
  }, [noteFilter, notes]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const refreshNotes = useCallback(async () => {
    try {
      const list = await invoke<LinkSuggestion[]>("autocomplete_links", {
        prefix: "",
      });
      setNotes(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const refreshBacklinks = useCallback(async (path: string) => {
    try {
      const links = await invoke<string[]>("get_backlinks", { path });
      setBacklinks(links);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // ── Core save (always uses refs so it's safe inside any closure) ───────────

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
      console.error("save_file error:", err);
      setStatus(`Save error: ${String(err)}`);
      setSaveStatus("unsaved");
    }
  }, [refreshBacklinks]);

  // ── Debounced auto-save triggered from onChange ────────────────────────────

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [performSave]);

  // ── onChange from the editor ───────────────────────────────────────────────

  const handleChange = useCallback(
    (val: string) => {
      setContent(val);
      isDirtyRef.current = true;
      setSaveStatus("unsaved");
      scheduleSave();
    },
    [scheduleSave],
  );

  // ── Ctrl+S keyboard shortcut ───────────────────────────────────────────────

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

  // ── Save on window blur ────────────────────────────────────────────────────

  useEffect(() => {
    const onBlur = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      performSave();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [performSave]);

  // ── External file-change listener ─────────────────────────────────────────

  useEffect(() => {
    const promise = listen<string>("vault://file-changed", (event) => {
      const changedPath = event.payload;
      const current = selectedRef.current;
      if (!current || changedPath !== current.path) return;

      if (isDirtyRef.current) {
        // We have unsaved edits — warn the user instead of overwriting them
        setSaveStatus("conflict");
        setStatus(
          "⚠ This file was changed externally. Save or discard your changes.",
        );
      } else {
        // No local edits — silently reload
        invoke<string>("open_file", { path: changedPath })
          .then((text) => {
            setContent(text);
            setSaveStatus("saved");
          })
          .catch(console.error);
      }
    });
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, []);

  // ── Vault indexing ────────────────────────────────────────────────────────

  const indexVault = useCallback(
    async (path: string) => {
      try {
        setIsIndexing(true);
        setStatus("Indexing vault…");
        await invoke("index_vault", { path });
        await refreshNotes();
        setVaultPath(path);
        setStatus("Vault indexed.");
      } catch (err) {
        console.error(err);
        setStatus(`Index error: ${String(err)}`);
      } finally {
        setIsIndexing(false);
      }
    },
    [refreshNotes],
  );

  // ── Open a note — save current one first ─────────────────────────────────

  const loadNote = useCallback(
    async (note: LinkSuggestion) => {
      // Flush any pending save for the current note before switching
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await performSave();

      try {
        setStatus(`Opening ${note.name}…`);
        const text = await invoke<string>("open_file", { path: note.path });
        setSelected(note);
        setContent(text);
        isDirtyRef.current = false;
        setSaveStatus("saved");
        await refreshBacklinks(note.path);
        setStatus(null);
      } catch (err) {
        console.error(err);
        setStatus(`Open error: ${String(err)}`);
      }
    },
    [performSave, refreshBacklinks],
  );

  // ── Dismiss conflict ───────────────────────────────────────────────────────

  const discardAndReload = useCallback(async () => {
    const note = selectedRef.current;
    if (!note) return;
    try {
      const text = await invoke<string>("open_file", { path: note.path });
      setContent(text);
      isDirtyRef.current = false;
      setSaveStatus("saved");
      setStatus(null);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // ── Link / tag autocomplete for the editor ────────────────────────────────

  const onFetchLinks = useCallback(async (query: string) => {
    try {
      return await invoke<LinkSuggestion[]>("autocomplete_links", {
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

  const handleOpenLink = useCallback(
    (linkName: string) => {
      const target = notes.find(
        (n) => n.name === linkName || n.name === `${linkName}.md`,
      );
      if (target) {
        loadNote(target);
      } else {
        setStatus(`Could not find linked note: ${linkName}`);
      }
    },
    [notes, loadNote],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Vault path (absolute)"
          className="w-96 px-3 py-2 rounded-md bg-slate-800 text-slate-100 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={vaultInput}
          onChange={(e) => setVaultInput(e.target.value)}
        />
        <button
          type="button"
          onClick={() => indexVault(vaultInput)}
          className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
          disabled={isIndexing || vaultInput.trim() === ""}
        >
          {isIndexing ? "Indexing…" : "Set & Index"}
        </button>
        {vaultPath && (
          <button
            type="button"
            onClick={() => indexVault(vaultPath)}
            className="px-3 py-2 rounded-md bg-slate-800 text-slate-100 text-sm hover:bg-slate-700 disabled:opacity-50"
            disabled={isIndexing}
          >
            Re-index
          </button>
        )}
        {vaultPath && (
          <span className="text-sm text-slate-300 truncate max-w-xs">
            {vaultPath}
          </span>
        )}
        {status && (
          <span className="text-sm text-slate-400 ml-auto truncate max-w-sm">
            {status}
          </span>
        )}
      </div>

      {/* ── Main layout ── */}
      <div className="grid grid-cols-12 gap-4 min-h-[70vh]">
        {/* ── Sidebar: note list ── */}
        <div className="col-span-3 bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col">
          <input
            type="text"
            placeholder="Filter notes"
            className="w-full px-3 py-2 mb-3 rounded-md bg-slate-800 text-slate-100 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={noteFilter}
            onChange={(e) => setNoteFilter(e.target.value)}
            disabled={isIndexing}
          />
          <div className="overflow-auto flex-1 space-y-1">
            {filteredNotes.map((note) => (
              <button
                key={note.path}
                onClick={() => loadNote(note)}
                className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                  selected?.path === note.path
                    ? "bg-blue-600/20 border-blue-500 text-blue-100"
                    : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                }`}
              >
                <div className="text-sm font-semibold truncate">
                  {note.name}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {note.path}
                </div>
              </button>
            ))}
            {filteredNotes.length === 0 && (
              <div className="text-sm text-slate-400">
                {vaultPath
                  ? "No matching notes."
                  : "Index a vault to get started."}
              </div>
            )}
          </div>
        </div>

        {/* ── Editor pane ── */}
        <div className="col-span-6 bg-slate-900/60 border border-slate-800 rounded-lg p-2 flex flex-col">
          {/* Editor header */}
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="text-sm text-slate-300 flex-1 truncate">
              {selected ? selected.name : "No note selected"}
            </div>
            <SaveIndicator status={saveStatus} />
          </div>

          {/* Conflict banner */}
          {saveStatus === "conflict" && (
            <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-md bg-red-900/40 border border-red-700 text-sm text-red-200">
              <span className="flex-1">
                File changed externally. Keep your edits or discard them?
              </span>
              <button
                onClick={performSave}
                className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-semibold"
              >
                Keep mine
              </button>
              <button
                onClick={discardAndReload}
                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold"
              >
                Discard
              </button>
            </div>
          )}

          {/* Editor */}
          <div className="flex-1 min-h-[60vh]">
            <Editor
              className="h-full"
              value={content}
              onChange={handleChange}
              initialContent=""
              onFetchLinks={onFetchLinks}
              onFetchTags={onFetchTags}
              onOpenLink={handleOpenLink}
            />
          </div>
        </div>

        {/* ── Sidebar: backlinks ── */}
        <div className="col-span-3">
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
            <div className="text-sm font-semibold text-slate-100 mb-2">
              Backlinks
            </div>
            <div className="space-y-1 max-h-72 overflow-auto">
              {backlinks.length === 0 ? (
                <div className="text-sm text-slate-400">No backlinks.</div>
              ) : (
                backlinks.map((path) => {
                  const name = path.split("/").pop() ?? path;
                  const note = notes.find((n) => n.path === path);
                  return (
                    <button
                      key={path}
                      onClick={() => note && loadNote(note)}
                      className="w-full text-left px-2 py-1.5 rounded-md text-sm text-slate-200 hover:bg-slate-800 truncate"
                      title={path}
                    >
                      {name}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
