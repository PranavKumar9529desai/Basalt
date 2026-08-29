import type { Extension } from "@codemirror/state";

export type FetchLinksFn = (
  query: string,
) => Promise<Array<{ name: string; path: string }>>;
export type FetchTagsFn = (query: string) => Promise<string[]>;

// ---------------------------------------------------------------------------
// Frontmatter model — mirrors `basalt_types::frontmatter` (camelCase on the
// wire). The parser is injected (EditorConfig.parseFrontmatter) so this
// package stays pure (ADR-022 rule 2). Spans are UTF-16 CodeMirror offsets.
// ---------------------------------------------------------------------------

/** Externally-tagged serde enum: `{ Text: "..." }`, `{ List: [...] }`, `"None"`, … */
export type FrontmatterValue =
  | { Text: string }
  | { List: FrontmatterValue[] }
  | { Number: number }
  | { Checkbox: boolean }
  | { Date: string }
  | { DateTime: string }
  | { Link: string }
  | "None";

export type FrontmatterDiagnosticKind =
  | "DuplicateKey"
  | "MalformedValue"
  | "TypeMismatch";

export interface FrontmatterDiagnostic {
  kind: FrontmatterDiagnosticKind;
  message: string;
  span: { start: number; end: number };
}

export interface FrontmatterEntry {
  key: string;
  value: FrontmatterValue;
  keySpan: { start: number; end: number };
  valueSpan: { start: number; end: number };
}

export interface FrontmatterModel {
  entries: FrontmatterEntry[];
  diagnostics: FrontmatterDiagnostic[];
  blockSpan: { start: number; end: number } | null;
}

export type ParseFrontmatterFn = (text: string) => FrontmatterModel | null;

export interface EditorConfig {
  onFetchLinks?: FetchLinksFn;
  onFetchTags?: FetchTagsFn;
  onOpenLink?: (link: string) => void;
  themeExtensions?: Extension[];
  includeDefaultTheme?: boolean;
  /**
   * Parse a document's YAML frontmatter into a typed, span-annotated model.
   * Injected (not imported) so `packages/editor` stays pure. The feature
   * layer supplies a Rust/WASM-backed implementation (ADR-022 rule 2).
   */
  parseFrontmatter?: ParseFrontmatterFn;
}
