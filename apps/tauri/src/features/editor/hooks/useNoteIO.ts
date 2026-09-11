import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import type { QueryResult, TaskQuery } from "@workspace/editor";
import { useActiveNoteStore } from "../store";
import type { BacklinkEntry, LinkSuggestion, SaveStatus } from "../types";

import { parseFrontmatter } from "../lib/frontmatter";
import { htmlToMarkdown } from "../lib/htmlToMarkdown";

/**
 * Single-flight dedup for task queries — if multiple widgets fire the same
 * query simultaneously (e.g. multiple ```tasks blocks in one note), only one
 * IPC round-trip is made. The entry is removed once the promise settles so
 * stale results never stick around.
 */
const inFlightTasks = new Map<string, Promise<QueryResult>>();

function runTasksQueryOnce(query: TaskQuery): Promise<QueryResult> {
  const key = JSON.stringify(query);
  const existing = inFlightTasks.get(key);
  if (existing) return existing;
  const p = invoke<QueryResult>("get_tasks", { query }).finally(() => {
    inFlightTasks.delete(key);
  });
  inFlightTasks.set(key, p);
  return p;
}

/**
 * useNoteIO — thin invoke wrappers for note file I/O (Phase 2 editor split).
 *
 * Owns NO document state: the document lives in CodeMirror (per-tab
 * EditorStates owned by EditorView). This hook only wraps IPC and the
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
      const links = await invoke<BacklinkEntry[]>("get_backlinks", { path });
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

  const runQuery = useCallback(async (dql: string): Promise<QueryResult> => {
    return invoke<QueryResult>("run_query", { dql, path: "" });
  }, []);

  const runTasksQuery = useCallback(
    async (query: TaskQuery): Promise<QueryResult> => {
      return runTasksQueryOnce(query);
    },
    [],
  );

  const onPasteImage = useCallback(
    async (data: Uint8Array, filename: string): Promise<string | null> => {
      try {
        const notePath = useActiveNoteStore.getState().activeNote?.path ?? null;
        const result = await invoke<{
          rel_path: string;
          abs_path: string;
          name: string;
        }>("save_attachment", {
          name: filename,
          data: Array.from(data),
          notePath,
        });
        return result.rel_path;
      } catch (err) {
        console.error("[useNoteIO] save_attachment failed:", err);
        return null;
      }
    },
    [],
  );

  const onPasteHtml = useCallback(
    async (html: string): Promise<string | null> => {
      const md = htmlToMarkdown(html);
      return md ? md : null;
    },
    [],
  );

  const onPasteFile = useCallback(
    async (uri: string, _filename: string): Promise<string | null> => {
      try {
        const notePath = useActiveNoteStore.getState().activeNote?.path ?? null;
        const result = await invoke<{
          rel_path: string;
          abs_path: string;
          name: string;
        }>("copy_attachment_from_path", {
          sourcePath: uri,
          notePath,
        });
        // The paste pipeline inserts this string verbatim — emit the embed.
        return `![[${result.rel_path}]]`;
      } catch (err) {
        console.error("[useNoteIO] copy_attachment_from_path failed:", err);
        return null;
      }
    },
    [],
  );

  const urlLinkFormatter = useCallback(
    (url: string, selectionText: string): string => `[${selectionText}](${url})`,
    [],
  );
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
    runQuery,
    runTasksQuery,
    onPasteImage,
    onPasteHtml,
    onPasteFile,
    urlLinkFormatter,
    parseFrontmatter,
  };
}
