// ---------------------------------------------------------------------------
// Query result types — mirrors crates/basalt-types/src/query.rs exactly.
// ---------------------------------------------------------------------------

export type TypedValue =
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  | { type: "date"; value: string }
  | { type: "checkbox"; value: boolean }
  | { type: "link"; name: string; path: string }
  | { type: "null" };

export interface QueryColumn {
  name: string;
  type: "text" | "number" | "date" | "checkbox" | "link";
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: TypedValue[][];
  total: number;
}

// ---------------------------------------------------------------------------
// Dependency types — injected by the feature layer so this package stays pure
// (ADR-022 rule 2 / ADR-007: no Tauri, no IPC in packages/ui).
// ---------------------------------------------------------------------------

export type RunQueryFn = (dql: string) => Promise<QueryResult>;

/** Open a note by name (resolved to a path by the feature layer). */
export type OpenLinkFn = (name: string) => void;
