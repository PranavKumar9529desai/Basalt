import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTabsStore } from "../store";
import { collectLeaves } from "../lib/layoutTree";
import { useTabPersistence } from "./useTabPersistence";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

describe("useTabPersistence", () => {
  beforeEach(() => {
    act(() => useTabsStore.getState().reset());
  });

  it("restores a v2 (split-pane) snapshot on boot", () => {
    act(() => {
      const s = useTabsStore.getState();
      s.openPinned({ path: "a.md" });
      s.splitActivePane("vertical");
    });
    const snap = useTabsStore.getState().toWorkspaceSnapshot();
    expect(snap.version).toBe(2);

    act(() => useTabsStore.getState().reset());
    renderHook(() =>
      useTabPersistence({
        workspace: { tabsWorkspace: snap },
        debounceMs: 10000,
      }),
    );

    const root = useTabsStore.getState().root;
    expect(root.type).toBe("split");
    expect(collectLeaves(root)).toHaveLength(2);
  });

  it("leaves the store untouched for malformed v2 snapshots", () => {
    const before = useTabsStore.getState().root;
    renderHook(() =>
      useTabPersistence({ workspace: { tabsWorkspace: { version: 2 } } }),
    );
    expect(useTabsStore.getState().root).toBe(before);
    expect(useTabsStore.getState().root.type).toBe("leaf");
  });
});