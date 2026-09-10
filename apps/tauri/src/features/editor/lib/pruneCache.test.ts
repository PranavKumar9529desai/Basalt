import { describe, expect, it, vi } from "vitest";

import {
  pruneClosedTabCaches,
  evictLruStates,
  type TabCaches,
  type TabStructureSource,
} from "./pruneCache";

function makeSource(open: {
  ids: string[];
  paths: string[];
  info?: Record<string, { path: string; title: string }>;
}): TabStructureSource {
  return {
    getOpenTabIds: () => new Set(open.ids),
    getOpenTabPaths: () => new Set(open.paths),
    getTabInfo: (id) => open.info?.[id] ?? null,
  };
}

function makeCaches(): TabCaches<unknown> {
  return {
    states: new Map(),
    scroll: new Map(),
    dirty: new Set(),
    tabMeta: new Map(),
  };
}

describe("pruneClosedTabCaches", () => {
  it("drops caches for a tab that is neither open by id nor by path", () => {
    const caches = makeCaches();
    caches.states.set("tab:a.md", { doc: "x" });
    caches.scroll.set("tab:a.md", 42);
    caches.tabMeta.set("tab:a.md", { path: "a.md", name: "a" });
    const source = makeSource({ ids: ["tab:b.md"], paths: ["b.md"] });
    pruneClosedTabCaches(caches, source, vi.fn());
    expect(caches.states.has("tab:a.md")).toBe(false);
    expect(caches.scroll.has("tab:a.md")).toBe(false);
    expect(caches.tabMeta.has("tab:a.md")).toBe(false);
  });

  it("keeps a tab open by id", () => {
    const caches = makeCaches();
    caches.states.set("tab:a.md", { doc: "x" });
    caches.tabMeta.set("tab:a.md", { path: "a.md", name: "a" });
    const source = makeSource({ ids: ["tab:a.md"], paths: ["a.md"] });
    pruneClosedTabCaches(caches, source, vi.fn());
    expect(caches.states.has("tab:a.md")).toBe(true);
  });

  it("keeps a tab open by path even when its id is absent (move/repaint)", () => {
    const caches = makeCaches();
    caches.states.set("tab:old.md", { doc: "x" });
    caches.tabMeta.set("tab:old.md", { path: "new.md", name: "new" });
    // id not in openIds, but the cached path IS still an open path
    const source = makeSource({ ids: ["tab:other.md"], paths: ["new.md"] });
    pruneClosedTabCaches(caches, source, vi.fn());
    expect(caches.states.has("tab:old.md")).toBe(true);
    expect(caches.tabMeta.has("tab:old.md")).toBe(true);
  });

  it("flush-saves a dirty closed tab before dropping its state", () => {
    const caches = makeCaches();
    caches.states.set("tab:a.md", { doc: "x" });
    caches.tabMeta.set("tab:a.md", { path: "a.md", name: "a" });
    caches.dirty.add("tab:a.md");
    const saveTab = vi.fn();
    const source = makeSource({ ids: [], paths: [] });
    pruneClosedTabCaches(caches, source, saveTab);
    expect(saveTab).toHaveBeenCalledWith("tab:a.md");
    expect(caches.states.has("tab:a.md")).toBe(false);
    expect(caches.dirty.has("tab:a.md")).toBe(false);
  });

  it("does NOT save a clean closed tab", () => {
    const caches = makeCaches();
    caches.states.set("tab:a.md", { doc: "x" });
    caches.tabMeta.set("tab:a.md", { path: "a.md", name: "a" });
    const saveTab = vi.fn();
    const source = makeSource({ ids: [], paths: [] });
    pruneClosedTabCaches(caches, source, saveTab);
    expect(saveTab).not.toHaveBeenCalled();
  });

  it("refreshes stale cached metadata from live tab info for open tabs", () => {
    const caches = makeCaches();
    caches.states.set("tab:a.md", { doc: "x" });
    caches.tabMeta.set("tab:a.md", { path: "a.md", name: "a" });
    const source = makeSource({
      ids: ["tab:a.md"],
      paths: ["a.md"],
      info: { "tab:a.md": { path: "a-renamed.md", title: "a renamed" } },
    });
    pruneClosedTabCaches(caches, source, vi.fn());
    expect(caches.tabMeta.get("tab:a.md")).toEqual({
      path: "a-renamed.md",
      name: "a renamed",
    });
  });

  it("prunes tabMeta entries whose id and path are both closed", () => {
    const caches = makeCaches();
    caches.states.set("tab:a.md", { doc: "x" });
    caches.tabMeta.set("tab:a.md", { path: "a.md", name: "a" });
    caches.tabMeta.set("tab:ghost.md", { path: "ghost.md", name: "ghost" });
    const source = makeSource({ ids: ["tab:a.md"], paths: ["a.md"] });
    pruneClosedTabCaches(caches, source, vi.fn());
    expect(caches.tabMeta.has("tab:a.md")).toBe(true);
    expect(caches.tabMeta.has("tab:ghost.md")).toBe(false);
  });

  it("keeps tabMeta open by path even if the holding id differs", () => {
    const caches = makeCaches();
    caches.states.set("tab:a.md", { doc: "x" });
    caches.tabMeta.set("tab:a.md", { path: "a.md", name: "a" });
    // path 'a.md' still open though a different tab id holds it
    const source = makeSource({ ids: ["tab:other.md"], paths: ["a.md"] });
    pruneClosedTabCaches(caches, source, vi.fn());
    expect(caches.tabMeta.has("tab:a.md")).toBe(true);
  });
});

describe("evictLruStates", () => {
  it("does nothing when state count is under maxStates", () => {
    const caches = makeCaches();
    caches.states.set("tab:1", { doc: "1" });
    caches.states.set("tab:2", { doc: "2" });
    evictLruStates(caches, "tab:2", 5);
    expect(caches.states.size).toBe(2);
  });

  it("evicts oldest non-active, non-dirty states down to maxStates", () => {
    const caches = makeCaches();
    caches.states.set("tab:1", { doc: "1" });
    caches.states.set("tab:2", { doc: "2" });
    caches.states.set("tab:3", { doc: "3" });
    caches.states.set("tab:4", { doc: "4" });

    // tab:4 is active, tab:2 is dirty
    caches.dirty.add("tab:2");

    evictLruStates(caches, "tab:4", 2);

    // tab:1 was oldest clean -> evicted
    expect(caches.states.has("tab:1")).toBe(false);
    // tab:2 was dirty -> preserved
    expect(caches.states.has("tab:2")).toBe(true);
    // tab:3 was clean -> evicted
    expect(caches.states.has("tab:3")).toBe(false);
    // tab:4 was active -> preserved
    expect(caches.states.has("tab:4")).toBe(true);
    expect(caches.states.size).toBe(2);
  });

  it("never evicts dirty tabs even if states exceed maxStates", () => {
    const caches = makeCaches();
    caches.states.set("tab:1", { doc: "1" });
    caches.states.set("tab:2", { doc: "2" });
    caches.states.set("tab:3", { doc: "3" });

    // all tabs are dirty
    caches.dirty.add("tab:1");
    caches.dirty.add("tab:2");
    caches.dirty.add("tab:3");

    evictLruStates(caches, "tab:3", 1);

    expect(caches.states.size).toBe(3);
    expect(caches.states.has("tab:1")).toBe(true);
    expect(caches.states.has("tab:2")).toBe(true);
    expect(caches.states.has("tab:3")).toBe(true);
  });
});
