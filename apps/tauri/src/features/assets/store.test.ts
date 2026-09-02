import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { filterAssets, useAssetsStore, useFilteredAssets } from "./store";
import type { AssetInfo } from "./types";

function sampleAsset(
  relPath: string,
  contentHash: string,
  fileType: AssetInfo["file_type"] = "image",
  embedsBy: string[] = [],
  linkedBy: string[] = [],
): AssetInfo {
  return {
    rel_path: relPath,
    abs_path: `/vault/${relPath}`,
    file_name: relPath.split("/").pop() ?? relPath,
    file_type: fileType,
    mime_type: "image/png",
    size_bytes: 1024,
    content_hash: contentHash,
    width: null,
    height: null,
    embeds_by: embedsBy,
    linked_by: linkedBy,
  };
}

const assets: AssetInfo[] = [
  sampleAsset("_attachments/a.png", "hash-a", "image", ["/vault/note.md"]),
  sampleAsset("_attachments/dup1.png", "hash-b", "image", ["/vault/note.md"]),
  sampleAsset("_attachments/dup2.png", "hash-b", "image", []),
  sampleAsset("_attachments/clip.mp3", "hash-c", "audio", []),
];

describe("filterAssets", () => {
  it("passes everything through with defaults", () => {
    const out = filterAssets(assets, "all", "", false, false);
    expect(out).toHaveLength(4);
  });

  it("filters by type", () => {
    const out = filterAssets(assets, "audio", "", false, false);
    expect(out.map((a) => a.file_name)).toEqual(["clip.mp3"]);
  });

  it("filters orphans", () => {
    const out = filterAssets(assets, "all", "", false, true);
    expect(out.map((a) => a.file_name)).toEqual(["dup2.png", "clip.mp3"]);
  });

  it("filters duplicates by content hash group", () => {
    const out = filterAssets(assets, "all", "", true, false);
    expect(out.map((a) => a.file_name)).toEqual(["dup1.png", "dup2.png"]);
  });

  it("filters by filename search", () => {
    const out = filterAssets(assets, "all", "clip", false, false);
    expect(out.map((a) => a.file_name)).toEqual(["clip.mp3"]);
  });
});

describe("useFilteredAssets", () => {
  beforeEach(() => {
    useAssetsStore.setState({
      assets,
      filter: "all",
      search: "",
      showDuplicatesOnly: false,
      showOrphansOnly: false,
      auditReport: null,
      loading: false,
    });
  });

  it("returns a stable array reference across re-renders while inputs are unchanged", () => {
    // Regression: the old single-selector version returned a fresh array on
    // every call whenever a filter was active. zustand v5 feeds that straight
    // into useSyncExternalStore as the snapshot, so React saw an unstable
    // snapshot and re-rendered forever ("Maximum update depth exceeded").
    useAssetsStore.setState({ filter: "image" });
    const { result, rerender } = renderHook(() => useFilteredAssets());

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    // Store changes that do not affect the filtered view must not churn the
    // reference either.
    useAssetsStore.setState({ loading: true });
    rerender();
    expect(result.current).toBe(first);
  });

  it("reacts to filtering inputs", () => {
    useAssetsStore.setState({ filter: "audio" });
    const { result } = renderHook(() => useFilteredAssets());
    expect(result.current.map((a) => a.file_name)).toEqual(["clip.mp3"]);
  });
});
