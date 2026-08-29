import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import { useActiveNoteStore } from "../store";
import type { LinkSuggestion, SaveStatus } from "../types";

import { parseFrontmatter } from "../frontmatter";

/**
 * useNoteIO — thin invoke wrappers for note file I/O (Phase 2 editor split).
 *
 * Owns NO document state: the document lives in CodeMirror (per-tab
 * EditorStates owned by MarkdownLeaf). This hook only wraps IPC and the
 * small pieces of React state the UI actually renders (status line,
 * active tab's save status) and mirrors backlinks into the active-note
 * store for the right dock.
 */
export function useNoteIO() {
  const [status, setStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  const readFile = useCallback(
    (path: string) => invoke<string>("open_file", { path }),
    [],
  );

  const saveFile = useCallback(
    (path: string, content: string) => invoke("save_file", { path, content }),
    [],
  );

  const refreshBacklinks = useCallback(async (path: string) => {
    try {
      const links = await invoke<string[]>("get_backlinks", { path });
      useActiveNoteStore.getState().setActiveNoteBacklinks(links);
    } catch (err) {
      console.error("[useNoteIO] get_backlinks failed:", err);
    }
  }, []);

  const onFetchLinks = useCallback(
    async (query: string): Promise<LinkSuggestion[]> => {
      try {
        return await invoke<LinkSuggestion[]>("autocomplete_links", {
          prefix: query,
        });
      } catch {
        return [];
      }
    },
    [],
  );

  const onFetchTags = useCallback(async (query: string): Promise<string[]> => {
    try {
      return await invoke<string[]>("autocomplete_tags", { prefix: query });
    } catch {
      return [];
    }
  }, []);

  return {
    status,
    setStatus,
    saveStatus,
    setSaveStatus,
    readFile,
    saveFile,
    refreshBacklinks,
    onFetchLinks,
    onFetchTags,

    parseFrontmatter,
  };
}
