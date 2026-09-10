import { stemOf } from "@workspace/ui";
import type { TabId } from "../types";

let uniqueId = 0;

/** Monotonic, session-unique numeric suffix (disambiguates clone tab ids). */
export function genId(): number {
  return ++uniqueId;
}

/** Path-derived tab id. STABLE: a moved note's tab keeps this id after
 * `updateTabPaths` repoints it, so leaf caches keyed by id survive moves. */
export function newTabId(path: string): TabId {
  return `tab:${path}` as TabId;
}

/** Human label for a note path: basename minus a known extension. */
export function label(path: string): string {
  return stemOf(path) || path;
}
