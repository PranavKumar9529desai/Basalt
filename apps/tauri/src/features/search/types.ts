import type { FrontmatterModel, QueryResult } from "@workspace/editor";

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
  matches: LineMatch[];
}
/** Top-level result of `search_content`. */
export interface SearchContentResult {
  /** Total number of matching files in the index. */
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

/**
 * Dependencies the read-only search preview needs to render with full
 * reading-mode parity (ADR-029). Same dependency set the editor's reading mode
 * injects into `readingExtensions()` — frontmatter Properties panel, DQL block
 * execution, embed media resolution, and clickable links.
 *
 * Populated by the shell where `parseFrontmatter` (editor), `resolveAsset`
 * (leaf services), and `openNote`/`findNote` (app context) coexist. The shell
 * imports this type across the layer boundary (types-only), while the feature
 * never imports an upward layer.
 */
export interface PreviewDeps {
  /** Parse YAML frontmatter into a typed model (the WASM-backed parser). */
  parseFrontmatter: (text: string) => FrontmatterModel | null;
  /** Execute a DQL query for ```dql blocks. */
  runQuery: (dql: string) => Promise<QueryResult>;
  /** Resolve an embed target (`![[file]]`) to a loadable asset URL, or null. */
  resolveAsset: (target: string) => string | null;
  /** Open a note linked from a preview (wikilink / DQL result / link). */
  onOpenLink: (name: string) => void;
}
