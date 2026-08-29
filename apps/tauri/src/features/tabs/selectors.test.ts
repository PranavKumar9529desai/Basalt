import { describe, expect, it } from "vitest";
import type { TabId, TabModel, TabPane } from "./types";

import { getTabByPath } from "./selectors";

function tab(id: string, path: string, over: Partial<TabModel> = {}): TabModel {
  return {
    id,
    path,
    title: path,
    leafType: "markdown",
    isPinned: false,
    isPreview: false,
    isDirty: false,
    createdAt: 1,
    lastAccessedAt: 1,
    ...over,
  };
}

function pane(tabIds: TabId[], over: Partial<TabPane> = {}): TabPane {
  return {
    id: "p1",
    tabIds,
    activeTabId: tabIds[0] ?? null,
    previewTabId: null,
    ...over,
  };
}

describe("getTabByPath", () => {
  const a = tab("a.md", "a.md");
  const b = tab("b.md", "b.md");
  const tabs: Record<TabId, TabModel> = { "a.md": a, "b.md": b };

  it("returns the tab whose path matches", () => {
    expect(getTabByPath(pane(["a.md", "b.md"]), tabs, "b.md")).toBe(b);
  });

  it("returns null for an unknown path", () => {
    expect(getTabByPath(pane(["a.md"]), tabs, "missing.md")).toBe(null);
  });

  it("returns null for an empty pane", () => {
    expect(getTabByPath(pane([]), tabs, "a.md")).toBe(null);
  });

  it("only considers tabs listed in the pane, not every entry in tabs", () => {
    const t: Record<TabId, TabModel> = { ...tabs, "c.md": tab("c.md", "c.md") };
    // c.md exists in the tabs map but is absent from the pane ordering.
    expect(getTabByPath(pane(["a.md"]), t, "c.md")).toBe(null);
  });

  it("matches on path, not on the id-derived path (moved-tab case)", () => {
    // A note moved on disk: updateTabPaths repointed path but kept the
    // original path-derived id. Lookup must use path.
    const moved = tab("old/notes/a.md", "new/notes/a.md");
    const t: Record<TabId, TabModel> = { ...tabs, "old/notes/a.md": moved };
    expect(getTabByPath(pane(["old/notes/a.md"]), t, "new/notes/a.md")).toBe(moved);
    // The old path the id was derived from must NOT match.
    expect(getTabByPath(pane(["old/notes/a.md"]), t, "old/notes/a.md")).toBe(null);
  });

  it("returns the first pane-ordered tab when several share a path", () => {
    const dup1 = tab("d1", "dup.md");
    const dup2 = tab("d2", "dup.md");
    const t: Record<TabId, TabModel> = { d1: dup1, d2: dup2 };
    expect(getTabByPath(pane(["d1", "d2"]), t, "dup.md")).toBe(dup1);
  });
});
