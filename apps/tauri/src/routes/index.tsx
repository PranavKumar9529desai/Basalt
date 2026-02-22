import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Editor } from "@workspace/editor";

type LinkSuggestion = { name: string; path: string };

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [vaultInput, setVaultInput] = useState("");
  const [notes, setNotes] = useState<LinkSuggestion[]>([]);
  const [noteFilter, setNoteFilter] = useState("");
  const [selected, setSelected] = useState<LinkSuggestion | null>(null);
  const [content, setContent] = useState("");
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [linkPrefix, setLinkPrefix] = useState("");
  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const filteredNotes = useMemo(() => {
    const f = noteFilter.trim().toLowerCase();
    if (!f) return notes;
    return notes.filter((n) => n.name.toLowerCase().includes(f));
  }, [noteFilter, notes]);

  const indexVault = useCallback(async (path: string) => {
    try {
      setIsIndexing(true);
      setStatus("Indexing vault…");
      await invoke("index_vault", { path });
      await refreshNotes("");
      setStatus("Indexed vault.");
      setVaultPath(path);
    } catch (err) {
      console.error(err);
      setStatus(`Index error: ${String(err)}`);
    } finally {
      setIsIndexing(false);
    }
  }, []);

  const refreshNotes = useCallback(async (prefix: string) => {
    try {
      const list = await invoke<LinkSuggestion[]>("autocomplete_links", {
        prefix,
      });
      setNotes(list);
    } catch (err) {
      console.error(err);
      setStatus(`Autocomplete error: ${String(err)}`);
    }
  }, []);

  const loadNote = useCallback(async (note: LinkSuggestion) => {
    try {
      setSelected(note);
      setStatus(`Opening ${note.name}…`);
      const text = await invoke<string>("open_file", { path: note.path });
      setContent(text);
      await refreshBacklinks(note.path);
      setStatus(`Opened ${note.name}.`);
    } catch (err) {
      console.error(err);
      setStatus(`Open error: ${String(err)}`);
    }
  }, []);

  const refreshBacklinks = useCallback(async (path: string) => {
    try {
      const links = await invoke<string[]>("get_backlinks", { path });
      setBacklinks(links);
    } catch (err) {
      console.error(err);
      setStatus(`Backlinks error: ${String(err)}`);
    }
  }, []);

  const saveCurrent = useCallback(async () => {
    if (!selected) return;
    try {
      setIsSaving(true);
      setStatus("Saving…");
      await invoke("save_file", { path: selected.path, content });
      await refreshBacklinks(selected.path);
      setStatus("Saved.");
    } catch (err) {
      console.error(err);
      setStatus(`Save error: ${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  }, [content, refreshBacklinks, selected]);

  const fetchLinkSuggestions = useCallback(async () => {
    try {
      const list = await invoke<LinkSuggestion[]>("autocomplete_links", {
        prefix: linkPrefix,
      });
      setLinkSuggestions(list);
    } catch (err) {
      console.error(err);
      setStatus(`Autocomplete error: ${String(err)}`);
    }
  }, [linkPrefix]);

  useEffect(() => {
    if (linkPrefix === "" && notes.length) {
      setLinkSuggestions(notes);
      return;
    }
    fetchLinkSuggestions();
  }, [fetchLinkSuggestions, linkPrefix, notes.length]);

  const insertLink = useCallback((suggestion: LinkSuggestion) => {
    const insertion = `[[${suggestion.name}]]`;
    setContent(
      (prev) =>
        `${prev}${prev.endsWith("\n") || prev === "" ? "" : " "}${insertion}`,
    );
  }, []);

  const onFetchLinks = useCallback(async (query: string) => {
    try {
      return await invoke<LinkSuggestion[]>("autocomplete_links", { prefix: query });
    } catch (err) {
      console.error(err);
      return [];
    }
  }, []);

  const onFetchTags = useCallback(async (query: string) => {
    try {
      return await invoke<string[]>("autocomplete_tags", { prefix: query });
    } catch (err) {
      console.error(err);
      return [];
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
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
          className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500"
          disabled={isIndexing || vaultInput.trim() === ""}
        >
          Set & Index
        </button>
        {vaultPath && (
          <button
            type="button"
            onClick={() => indexVault(vaultPath)}
            className="px-3 py-2 rounded-md bg-slate-800 text-slate-100 text-sm hover:bg-slate-700"
            disabled={isIndexing}
          >
            Re-index
          </button>
        )}
        {vaultPath && (
          <span className="text-sm text-slate-300 truncate max-w-md">
            {vaultPath}
          </span>
        )}
        {status && (
          <span className="text-sm text-slate-400 ml-auto">{status}</span>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4 min-h-[70vh]">
        <div className="col-span-3 bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              placeholder="Filter notes"
              className="w-full px-3 py-2 rounded-md bg-slate-800 text-slate-100 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={noteFilter}
              onChange={(e) => setNoteFilter(e.target.value)}
              disabled={isIndexing}
            />
          </div>
          <div className="overflow-auto flex-1 space-y-1">
            {filteredNotes.map((note) => (
              <button
                key={note.path}
                onClick={() => loadNote(note)}
                className={`w-full text-left px-3 py-2 rounded-md border ${selected?.path === note.path
                    ? "bg-blue-600/20 border-blue-500 text-blue-100"
                    : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                  }`}
              >
                <div className="text-sm font-semibold">{note.name}</div>
                <div className="text-xs text-slate-400 truncate">
                  {note.path}
                </div>
              </button>
            ))}
            {filteredNotes.length === 0 && (
              <div className="text-sm text-slate-400">
                No notes yet. Index a vault.
              </div>
            )}
          </div>
        </div>

        <div className="col-span-6 bg-slate-900/60 border border-slate-800 rounded-lg p-2 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-sm text-slate-300 flex-1 truncate">
              {selected ? selected.path : "No note selected"}
            </div>
            <button
              type="button"
              onClick={saveCurrent}
              className="px-3 py-2 rounded-md bg-green-600 text-white text-sm font-semibold hover:bg-green-500 disabled:opacity-50"
              disabled={!selected || isSaving}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="flex-1 min-h-[60vh]">
            <Editor
              className="h-full"
              value={content}
              onChange={setContent}
              initialContent=""
              onFetchLinks={onFetchLinks}
              onFetchTags={onFetchTags}
            />
          </div>
        </div>

        <div className="col-span-3 space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
            <div className="text-sm font-semibold text-slate-100 mb-2">
              Backlinks
            </div>
            <div className="space-y-2 max-h-72 overflow-auto">
              {backlinks.map((path) => (
                <div key={path} className="text-sm text-slate-200">
                  {path}
                </div>
              ))}
              {backlinks.length === 0 && (
                <div className="text-sm text-slate-400">No backlinks.</div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
            <div className="text-sm font-semibold text-slate-100 mb-2">
              Link autocomplete ([[
            </div>
            <input
              type="text"
              placeholder="Start typing…"
              className="w-full px-3 py-2 mb-2 rounded-md bg-slate-800 text-slate-100 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={linkPrefix}
              onChange={(e) => setLinkPrefix(e.target.value)}
            />
            <div className="space-y-2 max-h-56 overflow-auto">
              {linkSuggestions.map((s) => (
                <button
                  key={s.path}
                  onClick={() => insertLink(s)}
                  className="w-full text-left px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700"
                >
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {s.path}
                  </div>
                </button>
              ))}
              {linkSuggestions.length === 0 && (
                <div className="text-sm text-slate-400">No matches.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
