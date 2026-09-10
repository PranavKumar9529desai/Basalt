import { Facet, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { RunQueryFn } from "./block-widgets/dql-widget";
export type { RunQueryFn } from "./block-widgets/dql-widget";
import type { RunTasksQueryFn } from "./block-widgets/task-query-widget";
export type { RunTasksQueryFn } from "./block-widgets/task-query-widget";
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
 * Internally-tagged serde value enum, unified with the DQL cell type
 * (ADR-030 Phase 2): `{ type: "text", value }`, `{ type: "list", items }`,
 * `{ type: "null" }`, …
 */
export type FrontmatterValue =
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  | { type: "date"; value: string }
  | { type: "datetime"; value: string }
  | { type: "checkbox"; value: boolean }
  | { type: "link"; name: string; path: string }
  | { type: "list"; items: FrontmatterValue[] }
  | { type: "null" };

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

/** Open an external (http/https) URL in the system browser. Injected by the
 * feature layer (Tauri `openUrl`); `packages/editor` stays pure — links are
 * never opened with `window.open`, which behaves wrongly inside a WebView
 * (no default browser routing, loses `noreferrer` guarantees per platform). */
export type OpenExternalLinkFn = (url: string) => void;

export interface EditorConfig {
  onFetchLinks?: FetchLinksFn;
  onFetchTags?: FetchTagsFn;
  onOpenLink?: (link: string) => void;
  /** Called when a `#tag` pill is clicked — the feature layer opens search
   *  prefilled with `tag:<tag>`. */
  onOpenTag?: (tag: string) => void;
  /** Open an external http(s) link in the system browser (warehouse of the
   * reading-mode link handler). Default: links are not opened (no-op). */
  openExternalLink?: OpenExternalLinkFn;
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
  /**
   * Execute a DQL query against the vault and return its result. Injected
   * so `packages/editor` stays pure; the feature layer routes it to the
   * `run_query` Tauri IPC command (basalt-tables engine).
   */
  runQuery?: RunQueryFn;
  /**
   * Execute a TASK query against the vault (`get_tasks` Tauri IPC). Injected
   * so `packages/editor` stays pure — the feature layer owns the IPC call.
   * Unlike `runQuery` (DQL text), this takes a structured TaskQuery.
   */
  runTasksQuery?: RunTasksQueryFn;
  /**
   * Resolve an embed target (`![[file]]`) to a loadable asset URL (e.g. via
   * Tauri's `convertFileSrc`). Return `null` when the target is not a
   * resolvable file. Injected so `packages/editor` stays pure.
   */
  resolveAsset?: (target: string) => string | null;
  /**
   * Called when the cursor enters/leaves a markdown table or moves within one.
   * Used by the table controls sidebar to enable/disable buttons.
   */
  onTableCursorChange?: (
    state: { inTable: boolean; row: number; col: number } | null,
  ) => void;
}

/** Resolve an embed target (`![[file]]`) to a loadable asset URL.
 * Injected by the feature layer so `packages/editor` stays pure. */
export const resolveAssetFacet = Facet.define<
  ((target: string) => string | null) | undefined,
  ((target: string) => string | null) | undefined
>({ combine: (values) => values[0] });

/** Open an external (http/https) URL in the system browser. Injected by the
 * feature layer so `packages/editor` stays pure. */
export const openExternalLinkFacet = Facet.define<
  OpenExternalLinkFn | undefined,
  OpenExternalLinkFn | undefined
>({ combine: (values) => values[0] });

/** Open a tag (`#tag` pill click) — the feature layer opens search prefilled
 * with `tag:<tag>`. Injected so `packages/editor` stays pure. */
export const openTagFacet = Facet.define<
  ((tag: string) => void) | undefined,
  ((tag: string) => void) | undefined
>({ combine: (values) => values[0] });
