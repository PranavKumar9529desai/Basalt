import { invoke } from "@tauri-apps/api/core";

import type {
  FileMatch,
  FileResult,
  SearchContentResult,
} from "../types";

// Guards against out-of-order responses (a slower earlier query returning after a
// newer one) overwriting fresher results — the classic search-as-you-type flicker.
let latestSearchSeq = 0;
let latestSwitcherSeq = 0;
let latestPreviewSeq = 0;

/** Allocate the next search sequence; pair with `isSearchSeqCurrent`. */
export const nextSearchSeq = (): number => ++latestSearchSeq;
/** Allocate the next switcher sequence; pair with `isSwitcherSeqCurrent`. */
export const nextSwitcherSeq = (): number => ++latestSwitcherSeq;
/** Allocate the next preview sequence; pair with `isPreviewSeqCurrent`. */
export const nextPreviewSeq = (): number => ++latestPreviewSeq;

export const isSearchSeqCurrent = (seq: number): boolean =>
  seq === latestSearchSeq;
export const isSwitcherSeqCurrent = (seq: number): boolean =>
  seq === latestSwitcherSeq;
export const isPreviewSeqCurrent = (seq: number): boolean =>
  seq === latestPreviewSeq;

/** Number of line matches in the bounded result window shown in the modal. */
export const countMatches = (results: FileMatch[]): number =>
  results.reduce((n, f) => n + f.matches.length, 0);

const SWITCHER_EXT_RE = /\.(?:md|markdown|canvas)$/i;
const switcherBasename = (path: string): string =>
  path.split("/").pop() ?? path;
const switcherDisplayName = (path: string): string =>
  switcherBasename(path).replace(SWITCHER_EXT_RE, "");

/** Offer the "Create new note" row whenever the query names no existing file. */
export const canCreateSwitcher = (query: string, results: FileResult[]): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return !results.some((r) => {
    const raw = switcherBasename(r.path);
    return (
      switcherDisplayName(r.path).toLowerCase() === q ||
      raw.toLowerCase() === q
    );
  });
};

/** Full-text tantivy search for the search modal. */
export const searchContent = (
  query: string,
  limit: number,
): Promise<SearchContentResult> =>
  invoke<SearchContentResult>("search_content", { query, limit });

/** Nucleo fuzzy file search for the quick switcher. */
export const searchFiles = (
  query: string,
  limit: number,
): Promise<FileResult[]> => invoke<FileResult[]>("search_files", { query, limit });

/** Read a file's text for the search preview pane. */
export const openFileForPreview = (path: string): Promise<string> =>
  invoke<string>("open_file", { path });