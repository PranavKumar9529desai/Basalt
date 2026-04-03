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

export function useTabPersistence({
  workspace,
  workspaceKey = "tabsWorkspace",
  debounceMs = 400,
  enabled = true,
}: UseTabPersistenceOptions = {}) {
  const hydrateFromWorkspaceSnapshot = useTabsStore(
    (state) => state.hydrateFromWorkspaceSnapshot,
  );
  const toWorkspaceSnapshot = useTabsStore(
    (state) => state.toWorkspaceSnapshot,
  );
  const tabs = useTabsStore((state) => state.tabs);
  const groups = useTabsStore((state) => state.groups);
  const groupOrder = useTabsStore((state) => state.groupOrder);
  const focusedGroupId = useTabsStore((state) => state.focusedGroupId);

  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    const maybeSnapshot = workspace?.[workspaceKey];
    if (isTabSnapshot(maybeSnapshot)) {
      hydrateFromWorkspaceSnapshot(maybeSnapshot);
    }
    restoredRef.current = true;
  }, [enabled, hydrateFromWorkspaceSnapshot, workspace, workspaceKey]);

  useEffect(() => {
    if (!enabled || !restoredRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const snapshot = toWorkspaceSnapshot();
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
  }, [
    debounceMs,
    enabled,
    focusedGroupId,
    groupOrder,
    groups,
    tabs,
    toWorkspaceSnapshot,
    workspaceKey,
  ]);
}
