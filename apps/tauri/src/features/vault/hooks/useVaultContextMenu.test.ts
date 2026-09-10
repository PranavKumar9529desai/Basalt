import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useVaultContextMenuState } from "./useVaultContextMenu";
import { mouse, node } from "./testUtils";

const B = node("b.md", "file", 1);

describe("useVaultContextMenuState", () => {
  it("openForNode records the anchor, target, and multi-select flag", () => {
    const { result } = renderHook(() => useVaultContextMenuState());
    act(() =>
      result.current.openForNode(B, mouse({ clientX: 9, clientY: 11 }), false),
    );
    const ms = result.current.menuState;
    expect(ms.anchor).toEqual({ x: 9, y: 11 });
    expect(ms.target?.kind).toBe("file");
    expect(ms.target?.node?.path).toBe("b.md");
    expect(result.current.isOpen).toBe(true);
  });

  it("openForRoot targets the root with no node", () => {
    const { result } = renderHook(() => useVaultContextMenuState());
    act(() => result.current.openForRoot(mouse()));
    expect(result.current.menuState.target?.kind).toBe("root");
    expect(result.current.menuState.target?.node).toBe(null);
  });
});
