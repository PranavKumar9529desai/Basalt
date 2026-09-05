import { describe, expect, it } from "vitest";
import type { TabId, TabModel } from "./types";

import { getTabByPath } from "./selectors";

function tab(id: string, path: string, over: Partial<TabModel> = {}): TabModel {
  return {
    id: id as TabId,
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

describe("getTabByPath", () => {
  const a = tab("a.md", "a.md");
  const b = tab("b.md", "b.md");
  const tabs: Record<TabId, TabModel> = { "a.md": a, "b.md": b };

  it("returns the tab whose path matches", () => {
    expect(getTabByPath(["a.md", "b.md"] as TabId[], tabs, "b.md")).toBe(b);
  });

  it("returns null for an unknown path", () => {
    expect(getTabByPath(["a.md"] as TabId[], tabs, "missing.md")).toBe(null);
  });

  it("returns null for an empty pane", () => {
    expect(getTabByPath([] as TabId[], tabs, "a.md")).toBe(null);
  });

  it("only considers tabs listed in the pane, not every entry in tabs", () => {
    const t: Record<TabId, TabModel> = { ...tabs, "c.md": tab("c.md", "c.md") };
    // c.md exists in the tabs map but is absent from the pane ordering.
    expect(getTabByPath(["a.md"] as TabId[], t, "c.md")).toBe(null);
  });

  it("matches on path, not on the id-derived path (moved-tab case)", () => {
    // A note moved on disk: updateTabPaths repointed path but kept the
    // original path-derived id. Lookup must use path.
    const moved = tab("old/notes/a.md", "new/notes/a.md");
    const t: Record<TabId, TabModel> = { ...tabs, "old/notes/a.md": moved };
    expect(
      getTabByPath(["old/notes/a.md"] as TabId[], t, "new/notes/a.md"),
    ).toBe(moved);
    // The old path the id was derived from must NOT match.
    expect(
      getTabByPath(["old/notes/a.md"] as TabId[], t, "old/notes/a.md"),
    ).toBe(null);
  });

  it("returns the first pane-ordered tab when several share a path", () => {
    const dup1 = tab("d1", "dup.md");
    const dup2 = tab("d2", "dup.md");
    const t: Record<TabId, TabModel> = { d1: dup1, d2: dup2 };
    expect(getTabByPath(["d1", "d2"] as TabId[], t, "dup.md")).toBe(dup1);
  });
});