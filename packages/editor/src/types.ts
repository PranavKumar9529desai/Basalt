import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type FetchLinksFn = (
  query: string,
) => Promise<Array<{ name: string; path: string }>>;
export type FetchTagsFn = (query: string) => Promise<string[]>;

/**
 * The frontmatter model mirrors `basalt_types::frontmatter` (camelCase on
 * the wire). The parser is injected via `EditorConfig.parseFrontmatter`
 * back into this package so `packages/editor` stays pure; span fields are
 * UTF-16 CodeMirror offsets.
 */

/**
 * Externally-tagged serde value enum: `{ Text: "..." }`, `{ List: [...] }`,
 * `"None"`, …
 */
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
/** Callback the inline frontmatter widget uses to mutate a property. Supplied by
 * the feature layer (which owns the surgical span edits — ADR-022 rule 4);
 * the editor package stays pure (ADR-022 rule 2). The widget binds the view
 * itself at toDOM (no module-global "active editor", ADR-022 rule 10). `newKey`
 * renames an existing key. */
export type FrontmatterEditFn = (
  view: EditorView,
  key: string,
  value?: FrontmatterValue,
  newKey?: string,
) => void;
export interface FrontmatterFetch {
  onFetchTags?: FetchTagsFn;
  onFetchLinks?: FetchLinksFn;
}

/**
 * Save a pasted/dropped image into the vault. The feature layer owns the IPC
 * call; this package stays pure. Returns the vault-relative path of the saved
 * file (e.g. `"_attachments/image.png"`) or `null` to cancel the insert.
 */
export type OnPasteImageFn = (
  data: Uint8Array,
  filename: string,
) => Promise<string | null>;

export interface EditorConfig {
  onFetchLinks?: FetchLinksFn;
  onFetchTags?: FetchTagsFn;
  onOpenLink?: (link: string) => void;
  /** Save a pasted image and return its vault-relative path for `![[…]]`. */
  onPasteImage?: OnPasteImageFn;
  themeExtensions?: Extension[];
  includeDefaultTheme?: boolean;
  /**
   * Parse a document's YAML frontmatter into a typed, span-annotated model.
   * Injected (not imported) so `packages/editor` stays pure. The feature
   * layer supplies a Rust/WASM-backed implementation (ADR-022 rule 2).
   */
  parseFrontmatter?: ParseFrontmatterFn;
  /**
   * Edit a frontmatter property (value set/insert, key rename, or removal when
   * `value` is undefined) on the given editor view. Injected so
   * `packages/editor` stays pure; the feature layer routes it to a surgical
   * span edit (ADR-022 rule 4).
   */
  editFrontmatter?: FrontmatterEditFn;
}
