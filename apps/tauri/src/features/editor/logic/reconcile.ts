/**
 * External file-change reconciliation — the decision table, separate from
 * the Tauri event wiring so each branch is unit-testable.
 *
 * Model: vim's FileChangedShell. Self-write suppression lives in Rust
 * (watcher.rs), so events reaching the editor are "external by contract" —
 * but the content diff stays the only arbiter. Duplicate OS events, marker
 * misses, and no-op touches must never surface as conflicts or destroy undo
 * history, so identical content always wins:
 *
 *   disk === current doc → echo / no-op → ignore
 *   disk !== doc, dirty  → concurrent edit → conflict banner (user decides)
 *   disk !== doc, clean  → external edit → reload from disk
 *
 * Both `currentDoc` and `diskDoc` arrive as raw strings because that is the
 * only comparison the editor can trust; no path, event-kind, or timestamp is
 * consulted here.
 */
export type ReconcileAction = "ignore" | "reload" | "conflict";

export function decideReconcileAction(
  currentDoc: string,
  diskDoc: string,
  isDirty: boolean,
): ReconcileAction {
  if (currentDoc === diskDoc) return "ignore";
  return isDirty ? "conflict" : "reload";
}