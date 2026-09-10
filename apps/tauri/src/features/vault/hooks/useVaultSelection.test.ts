import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FileNode } from "@workspace/ui/components/file-tree";
import type { FlatTreeNode } from "../types";
import { useVaultSelectionState } from "./useVaultSelection";
import { mouse, node } from "./testUtils";

const A = node("a.md", "file", 0);
const B = node("b.md", "file", 1);
const C = node("c.md", "file", 2);

function asFileNode(n: FlatTreeNode): FileNode {
  return {
    id: n.path,
    name: n.name,
    isFolder: n.kind === "folder",
    depth: n.depth,
  } as FileNode;
}

describe("useVaultSelectionState", () => {
  it("selects a single node on a plain click and sets anchor + focus", () => {
    const { result } = renderHook(() => useVaultSelectionState());
    act(() => result.current.handleSelect(asFileNode(A), mouse(), [A, B, C]));
    expect(result.current.selectedIds.has("a.md")).toBe(true);
    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.anchorId).toBe("a.md");
    expect(result.current.focusedId).toBe("a.md");
  });

  it("toggles membership on a meta/ctrl click", () => {
    const { result } = renderHook(() => useVaultSelectionState());
    act(() => result.current.handleSelect(asFileNode(A), mouse(), [A, B, C]));
    act(() =>
      result.current.handleSelect(asFileNode(B), mouse({ metaKey: true }), [
        A,
        B,
        C,
      ]),
    );
    expect(result.current.selectedIds.has("a.md")).toBe(true);
    expect(result.current.selectedIds.has("b.md")).toBe(true);
    act(() =>
      result.current.handleSelect(asFileNode(A), mouse({ ctrlKey: true }), [
        A,
        B,
        C,
      ]),
    );
    expect(result.current.selectedIds.has("a.md")).toBe(false);
    expect(result.current.selectedIds.has("b.md")).toBe(true);
  });

  it("range-selects from the anchor on a shift click", () => {
    const { result } = renderHook(() => useVaultSelectionState());
    act(() => result.current.handleSelect(asFileNode(A), mouse(), [A, B, C]));
    act(() =>
      result.current.handleSelect(asFileNode(C), mouse({ shiftKey: true }), [
        A,
        B,
        C,
      ]),
    );
    expect(result.current.selectedIds.has("a.md")).toBe(true);
    expect(result.current.selectedIds.has("b.md")).toBe(true);
    expect(result.current.selectedIds.has("c.md")).toBe(true);
  });
});
