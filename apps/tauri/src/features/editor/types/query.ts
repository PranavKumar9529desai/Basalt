/**
 * Query types — mirrors crates/basalt-types/src/query.rs exactly.
 * Used by the frontend to type IPC responses from `run_query`.
 */

export type TypedValue =
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  | { type: "date"; value: string }
  | { type: "checkbox"; value: boolean }
  | { type: "link"; name: string; path: string }
  | { type: "null" }

export interface QueryColumn {
  name: string
  type: "text" | "number" | "date" | "checkbox" | "link"
}

export interface QueryResult {
  columns: QueryColumn[]
  rows: TypedValue[][]
  total: number
}
