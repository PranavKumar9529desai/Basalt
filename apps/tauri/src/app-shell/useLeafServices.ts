import type { LeafServices } from "@workspace/views";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useCallback, useMemo } from "react";

import { useTabsStore } from "../features/tabs";
import type { AppContextValue } from "./AppProvider";

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
      renameNote: ws.renameNote,
      resolveAsset: ws.vaultPath
        ? (target: string) => {
            const absPath = target.startsWith("/")
              ? target
              : `${ws.vaultPath}/${target}`;
            return convertFileSrc(absPath);
          }
        : undefined,
    }),
    [
      ws.openNote,
      markTabDirty,
      ws.findNote,
      ws.activeNote,
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
