import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useTabsStore } from "../store";
import type { TabsWorkspaceSnapshot } from "../types";

interface UseTabPersistenceOptions {
  workspace?: Record<string, unknown>;
  workspaceKey?: string;
  debounceMs?: number;
  enabled?: boolean;
}

function isTabSnapshot(value: unknown): value is TabsWorkspaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TabsWorkspaceSnapshot>;
  return candidate.version === 1 && Array.isArray(candidate.groupOrder);
}

/**
 * Subscribes to `persistVersion` instead of the full `tabs`/`groups` objects.
 *
 * This avoids re-rendering the parent component on every `markTabDirty` call
 * (which fires on every keystroke). Only structural mutations (open, close,
 * move, split, merge) bump `persistVersion`, so the persistence effect only
 * runs when the workspace layout actually changes.
 */
export function useTabPersistence({
  workspace,
  workspaceKey = "tabsWorkspace",
  debounceMs = 400,
  enabled = true,
}: UseTabPersistenceOptions = {}) {
  const hydrateFromWorkspaceSnapshot = useTabsStore(
    (state) => state.hydrateFromWorkspaceSnapshot,
  );
  const persistVersion = useTabsStore((state) => state.persistVersion);

  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Restore previous session once ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    const maybeSnapshot = workspace?.[workspaceKey];
    if (isTabSnapshot(maybeSnapshot)) {
      hydrateFromWorkspaceSnapshot(maybeSnapshot);
    }
    restoredRef.current = true;
  }, [enabled, hydrateFromWorkspaceSnapshot, workspace, workspaceKey]);

  // ── Persist on structural changes only ─────────────────────────────────────
  useEffect(() => {
    if (!enabled || !restoredRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const snapshot = useTabsStore.getState().toWorkspaceSnapshot();
      invoke("set_workspace_key", {
        key: workspaceKey,
        value: snapshot,
      }).catch((error) => {
        console.error("[tabs] failed to persist tabs workspace:", error);
      });
    }, debounceMs);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [debounceMs, enabled, persistVersion, workspaceKey]);
}
