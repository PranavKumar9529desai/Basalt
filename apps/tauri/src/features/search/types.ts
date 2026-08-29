export interface Highlight {
  start: number;
  end: number;
}

/** One line of context shown around a match in the preview pane. */
export interface ContextLine {
  lineNumber: number;
  text: string;
}

/** A single line that contains one or more query-term matches. */
export interface LineMatch {
  lineNumber: number;
  text: string;
  highlights: Highlight[];
  contextBefore: ContextLine[];
  contextAfter: ContextLine[];
}

/** One file with at least one matching line (LazyVim-style grep grouping). */
export interface FileMatch {
  path: string;
  title: string;
  score: number;
  /** Full file content (powers the syntax-highlighted preview pane). */
  text: string;
  matches: LineMatch[];
}
/** Top-level result of `search_content`. */
export interface SearchContentResult {
  /** Total matching lines across the counted window of files. */
  totalHits: number;
  /** Files returned for display, in relevance order. */
  files: FileMatch[];
}

/** One result from `search_files` (nucleo fuzzy file switcher). */
export interface FileResult {
  path: string;
  title: string;
  score: number;
}
