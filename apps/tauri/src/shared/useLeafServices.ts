import type { LeafServices } from "@workspace/views";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useCallback, useMemo } from "react";
import { classifyMediaExtension, extensionOf } from "@workspace/editor";

import { resolveLeafType } from "./leafType";
import { useTabsStore } from "../features/tabs";
import { useSearchStore } from "../features/search";
import { getSetting } from "../features/settings";
import type { FlatTreeNode } from "../features/vault";
import { isLinux, mediaUrlFor } from "./mediaServer";
import type { AppContextValue } from "./AppProvider";

/**
 * Part E stem resolution: when the target is extension-less (e.g. `asset-png`)
 * Obsidian resolves it by filename across the vault. Returns the unique file
 * whose stem matches, or null when zero/ambiguous.
 */
function stemMatch(
  treeNodes: FlatTreeNode[] | undefined,
  stem: string,
): FlatTreeNode | null {
  if (!treeNodes) return null;
  const wanted = stem.toLowerCase();
  let match: FlatTreeNode | null = null;
  for (const node of treeNodes) {
    if (node.kind !== "file") continue;
    const dot = node.name.lastIndexOf(".");
    const nodeStem = dot > 0 ? node.name.slice(0, dot) : node.name;
    if (nodeStem.toLowerCase() !== wanted) continue;
    if (match) return null; // ambiguous — Obsidian shows a picker
    match = node;
  }
  return match;
}

/**
 * Resolve an embed target to an absolute file path:
 *  - direct `vaultPath/target` join first;
 *  - extension-less/non-media targets fall back to a unique stem lookup (part E).
 * Returns null when the target cannot resolve to a real file.
 */
function resolveEmbedTarget(
  target: string,
  vaultPath: string,
  treeNodes: FlatTreeNode[] | undefined,
): string | null {
  const direct = target.startsWith("/") ? target : `${vaultPath}/${target}`;
  if (classifyMediaExtension(extensionOf(target)) !== "other") {
    return direct;
  }
  const byStem = stemMatch(treeNodes, target);
  return byStem ? byStem.path : null;
}

/**
 * Builds and memoizes the stable `LeafServices` bag the shell passes to
 * every leaf via `LeafServicesProvider`. Identity is stable across renders
 * so leaves never re-render on keystrokes.
 */
export function useLeafServices(ws: AppContextValue): LeafServices {
  const markTabDirty = useTabsStore((s) => s.markTabDirty);
  const openPinned = useTabsStore((s) => s.openPinned);

  const getOpenTabIds = useCallback(
    () => new Set(Object.keys(useTabsStore.getState().tabs)),
    [],
  );

  const getOpenTabPaths = useCallback(
    () =>
      new Set(Object.values(useTabsStore.getState().tabs).map((t) => t.path)),
    [],
  );

  const getTabInfo = useCallback(
    (tabId: string) => useTabsStore.getState().tabs[tabId] ?? null,
    [],
  );

  const onTabStructureChanged = useCallback((cb: () => void) => {
    let last = useTabsStore.getState().persistVersion;
    return useTabsStore.subscribe((s) => {
      if (s.persistVersion !== last) {
        last = s.persistVersion;
        cb();
      }
    });
  }, []);

  return useMemo(
    () => ({
      openNote: ws.openNote,
      markTabDirty,
      findNote: ws.findNote,
      activeNote: ws.activeNote,
      getOpenTabIds,
      getOpenTabPaths,
      getTabInfo,
      onTabStructureChanged,
      openPinned,
      openSearch: (query: string) => {
        void useSearchStore.getState().openSearchWithQuery(query);
      },
      // Read at call time (not memoized) so paste settings apply to the very
      // next paste after a change without a leaf remount.
      getPastePolicy: () => ({
        defaultPasteMode: getSetting("defaultPasteMode"),
        pastedUrlMode: getSetting("pastedUrlMode"),
      }),
      renameNote: ws.renameNote,
      resolveLeafType,
      resolveAsset: ws.vaultPath
        ? (target: string) => {
            const absPath = resolveEmbedTarget(
              target,
              ws.vaultPath,
              ws.treeNodes,
            );
            if (!absPath) return null; // no broken <img> for unresolvable targets
            if (classifyMediaExtension(extensionOf(absPath)) === "other") {
              return null; // .txt etc → fallback chip (ADR-034), never a broken <img>
            }
            if (isLinux()) return mediaUrlFor(absPath); // http://127.0.0.1:PORT/media?path=…
            return convertFileSrc(absPath); // asset:// works on macOS/Windows
          }
        : undefined,
    }),
    [
      ws.openNote,
      markTabDirty,
      ws.findNote,
      ws.activeNote,
      ws.treeNodes,
      getOpenTabIds,
      getOpenTabPaths,
      getTabInfo,
      onTabStructureChanged,
      openPinned,
      ws.renameNote,
      ws.vaultPath,
    ],
  );
}
