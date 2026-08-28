import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}));

const mockedInvoke = vi.mocked(invoke);

import { useVaultMutations } from "./useVaultMutations";

describe("useVaultMutations", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("movePaths batches into one invoke and returns true", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useVaultMutations());
    let ok = false;
    await act(async () => {
      ok = await result.current.movePaths(["a.md", "b.md"], "dest");
    });
    expect(ok).toBe(true);
    expect(mockedInvoke).toHaveBeenCalledWith("move_paths", {
      sourcePaths: ["a.md", "b.md"],
      destinationRelPath: "dest",
    });
  });

  it("movePaths returns false and skips invoke when empty", async () => {
    const { result } = renderHook(() => useVaultMutations());
    let ok = true;
    await act(async () => {
      ok = await result.current.movePaths([]);
    });
    expect(ok).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("confirmDelete single path calls delete_file", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useVaultMutations());
    act(() => {
      result.current.requestDelete("/v/note.md", "note.md");
    });
    expect(result.current.isDeleteConfirmOpen).toBe(true);
    expect(result.current.pendingDeletePath).toBe("/v/note.md");
    let ok = false;
    await act(async () => {
      ok = await result.current.confirmDelete();
    });
    expect(ok).toBe(true);
    expect(mockedInvoke).toHaveBeenCalledWith("delete_file", {
      path: "/v/note.md",
    });
  });

  it("requestDeleteMany sets plural state and confirmDelete calls delete_paths", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() => useVaultMutations());
    act(() => {
      result.current.requestDeleteMany([
        { path: "/v/a.md", name: "a.md" },
        { path: "/v/b.md", name: "b.md" },
      ]);
    });
    expect(result.current.pendingDeletePaths).toEqual(["/v/a.md", "/v/b.md"]);
    expect(result.current.pendingDeleteName).toBe("2 items");
    let ok = false;
    await act(async () => {
      ok = await result.current.confirmDelete();
    });
    expect(ok).toBe(true);
    expect(mockedInvoke).toHaveBeenCalledWith("delete_paths", {
      paths: ["/v/a.md", "/v/b.md"],
    });
  });

  it("createNote forwards to create_note", async () => {
    mockedInvoke.mockResolvedValue({ path: "/v/new.md", title: "new" });
    const { result } = renderHook(() => useVaultMutations());
    let res: unknown = null;
    await act(async () => {
      res = await result.current.createNote("new.md", "parent");
    });
    expect(mockedInvoke).toHaveBeenCalledWith("create_note", {
      name: "new.md",
      parent: "parent",
    });
    expect(res).toEqual({ path: "/v/new.md", title: "new" });
  });
});
