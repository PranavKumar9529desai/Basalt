import type { EditorState } from "@codemirror/state";

/**
 * Per-tab editor caches owned by MarkdownLeaf. Extracted from the component so
 * the prune-on-close logic is unit-testable without a CodeMirror render.
 *
 * - `states` holds the live EditorState per tab (undo/cursor/scroll survive tab
 *   switches)
 * - `scroll` caches the scroll offset per tab
 * - `dirty` tracks tabs with unsaved edits
 * - `tabMeta` caches {path, name} so a background tab saves to the right file
 *   even after a move repoints the tab's path in place (stable id)
 */
export interface TabCaches<T = EditorState> {
  states: Map<string, T>;
  scroll: Map<string, number>;
  dirty: Set<string>;
  tabMeta: Map<string, { path: string; name: string }>;
}

/** Read-only view of the tab structure MarkdownLeaf asks the workspace for. */
export interface TabStructureSource {
  getOpenTabIds(): Set<string>;
  getOpenTabPaths(): Set<string>;
  getTabInfo(id: string): { path: string; title: string } | null;
}

/**
 * Drop caches for tabs that are no longer open. A tab counts as "open" if its
 * id is present OR (for move/repaint safety) its cached path is still an open
 * path.
 *
 * Dirty closed tabs are flush-saved (fire-and-forget) before their state is
 * dropped, so a forced close never loses edits. Cached metadata is refreshed
 * from live tab info first, because a move repoints a tab's path in place
 * (stable id) and the stale cached path would otherwise cause a wrong-save or
 * an over-eager prune.
 */
export function pruneClosedTabCaches<T>(
  caches: TabCaches<T>,
  source: TabStructureSource,
  saveTab: (id: string) => void | Promise<void>,
): void {
  const openIds = source.getOpenTabIds();
  const openPaths = source.getOpenTabPaths();

  // Refresh metadata first: a move repoints a tab's path in place (stable id),
  // so cached {path} snapshots can be stale for background tabs that are about
  // to be flush-saved or pruned below.
  for (const id of caches.states.keys()) {
    const info = source.getTabInfo(id);
    if (!info) continue;
    const meta = caches.tabMeta.get(id);
    if (!meta || meta.path !== info.path || meta.name !== info.title) {
      caches.tabMeta.set(id, { path: info.path, name: info.title });
    }
  }

  for (const id of caches.states.keys()) {
    // Match on path as well as id: if a future rename/move feature rekeys tabs
    // (id derives from path), the old id disappears while the note itself is
    // still open - pruning it would drop live state.
    const meta = caches.tabMeta.get(id);
    if (openIds.has(id) || (meta && openPaths.has(meta.path))) continue;
    if (caches.dirty.has(id)) void saveTab(id);
    caches.states.delete(id);
    caches.scroll.delete(id);
    caches.dirty.delete(id);
  }

  for (const [id, meta] of caches.tabMeta) {
    if (!openIds.has(id) && !openPaths.has(meta.path)) {
      caches.tabMeta.delete(id);
    }
  }
}
