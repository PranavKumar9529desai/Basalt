import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTabsStore } from "../store";
import { useTabDnD, resetTabDnDStateForTests } from "./useTabDnD";
import { dragEvent } from "./lib/testUtils";

vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

describe("useTabDnD", () => {
  beforeEach(() => {
    act(() => useTabsStore.getState().reset());
    resetTabDnDStateForTests();
  });

  it("prevents default and sets dropEffect on drag over", () => {
    const { result } = renderHook(() => useTabDnD());
    const e = dragEvent();
    act(() => result.current.handleTabDragOver(e));
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.dataTransfer.dropEffect).toBe("move");
  });
});
