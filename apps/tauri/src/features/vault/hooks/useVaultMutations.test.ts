import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateNoteResult } from "../types";

import { useVaultMutations } from "./useVaultMutations";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useRouter } from "@tanstack/react-router";
const useRouterMock = useRouter as unknown as () => { invalidate: () => void };

function setup() {
  const invalidate = vi.fn();
  vi.mocked(useRouterMock).mockReturnValue({ invalidate });
  const { result } = renderHook(() => useVaultMutations());
  return { result, invalidate };
}

describe("useVaultMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with empty initial state", () => {
    const { result } = setup();
    expect(result.current.ghostNode).toBe(null);
    expect(result.current.isDeleteConfirmOpen).toBe(false);
    expect(result.current.pendingDeletePaths).toEqual([]);
    expect(result.current.pendingDeleteNames).toEqual([]);
    expect(result.current.pendingDeletePath).toBe(null);
    expect(result.current.pendingDeleteName).toBe("");
    expect(result.current.error).toBe(null);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isIndexing).toBe(false);
    expect(result.current.status).toBe(null);
  });

  describe("ghost / inline creation", () => {
    it("createNoteInline seeds an editing, non-folder ghost node", () => {
      const { result } = setup();
      act(() =>
        result.current.createNoteInline({ parentRelPath: "dir", depth: 2 }),
      );
      expect(result.current.ghostNode).toMatchObject({
        id: "__ghost__",
        name: "",
        isFolder: false,
        isEditing: true,
        parentRelPath: "dir",
        depth: 2,
      });
    });

    it("createFolderInline seeds a folder ghost node", () => {
      const { result } = setup();
      act(() => result.current.createFolderInline());
      expect(result.current.ghostNode?.isFolder).toBe(true);
    });

    it("clearGhost removes the ghost node", () => {
      const { result } = setup();
      act(() => result.current.createNoteInline());
      act(() => result.current.clearGhost());
      expect(result.current.ghostNode).toBe(null);
    });
  });

  describe("requestDelete", () => {
    it("stages a single path for confirmation", () => {
      const { result } = setup();
      act(() => result.current.requestDelete("a.md", "A"));
      expect(result.current.pendingDeletePaths).toEqual(["a.md"]);
      expect(result.current.pendingDeleteNames).toEqual(["A"]);
      expect(result.current.pendingDeletePath).toBe("a.md");
      expect(result.current.pendingDeleteName).toBe("A");
      expect(result.current.isDeleteConfirmOpen).toBe(true);
    });
  });

  describe("requestDeleteMany", () => {
    it("stages many paths and labels them as N items", () => {
      const { result } = setup();
      act(() =>
        result.current.requestDeleteMany([
          { path: "a.md", name: "A" },
          { path: "b.md", name: "B" },
        ]),
      );
      expect(result.current.pendingDeletePaths).toEqual(["a.md", "b.md"]);
      expect(result.current.pendingDeletePath).toBe("a.md");
      expect(result.current.pendingDeleteName).toBe("2 items");
    });

    it("uses the single item name as the label", () => {
      const { result } = setup();
      act(() =>
        result.current.requestDeleteMany([{ path: "a.md", name: "A" }]),
      );
      expect(result.current.pendingDeleteName).toBe("A");
    });

    it("is a no-op for an empty selection", () => {
      const { result } = setup();
      act(() => result.current.requestDeleteMany([]));
      expect(result.current.pendingDeletePaths).toEqual([]);
      expect(result.current.isDeleteConfirmOpen).toBe(false);
    });
  });

  describe("confirmDelete", () => {
    it("deletes a single file and resets pending-delete state", async () => {
      const { result } = setup();
      act(() => result.current.requestDelete("a.md", "A"));
      let ok = false;
      await act(async () => {
        ok = await result.current.confirmDelete();
      });
      expect(ok).toBe(true);
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("delete_file", {
        path: "a.md",
      });
      expect(result.current.pendingDeletePaths).toEqual([]);
      expect(result.current.isDeleteConfirmOpen).toBe(false);
      expect(result.current.pendingDeleteName).toBe("");
    });

    it("deletes multiple paths via delete_paths", async () => {
      const { result } = setup();
      act(() =>
        result.current.requestDeleteMany([
          { path: "a.md", name: "A" },
          { path: "b.md", name: "B" },
        ]),
      );
      let ok = false;
      await act(async () => {
        ok = await result.current.confirmDelete();
      });
      expect(ok).toBe(true);
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("delete_paths", {
        paths: ["a.md", "b.md"],
      });
    });

    it("returns false without invoking when nothing is staged", async () => {
      const { result, invalidate } = setup();
      let ok = false;
      await act(async () => {
        ok = await result.current.confirmDelete();
      });
      expect(ok).toBe(false);
      expect(vi.mocked(invoke)).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  describe("createNote", () => {
    it("invokes create_note with parent null when omitted and returns the result", async () => {
      const { result } = setup();
      vi.mocked(invoke).mockResolvedValue({
        path: "dir/x.md",
        name: "x.md",
      } as CreateNoteResult);
      const res = await act(async () =>
        result.current.createNote("x.md", "dir"),
      );
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_note", {
        name: "x.md",
        parent: "dir",
      });
      expect(res).toEqual({ path: "dir/x.md", name: "x.md" });
    });

    it("nulls parent and records error on failure", async () => {
      const { result } = setup();
      vi.mocked(invoke).mockRejectedValue(new Error("boom"));
      const res = await act(async () => result.current.createNote("x.md"));
      expect(res).toBe(null);
      expect(result.current.error).toBe("Error: boom");
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_note", {
        name: "x.md",
        parent: null,
      });
    });
  });

  describe("createUntitledNote", () => {
    it("invokes create_untitled_note with parent null", async () => {
      const { result } = setup();
      vi.mocked(invoke).mockResolvedValue({
        path: "untitled.md",
        name: "untitled",
      } as CreateNoteResult);
      await act(async () => result.current.createUntitledNote("dir"));
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_untitled_note", {
        parent: "dir",
      });
    });
  });

  describe("createFolder", () => {
    it("invokes create_folder with parent null when omitted", async () => {
      const { result } = setup();
      vi.mocked(invoke).mockResolvedValue("new-folder");
      const res = await act(async () =>
        result.current.createFolder("new-folder"),
      );
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_folder", {
        name: "new-folder",
        parent: null,
      });
      expect(res).toBe("new-folder");
    });
  });

  describe("movePaths", () => {
    it("is a no-op (false) for an empty source list and never invokes", async () => {
      const { result } = setup();
      const ok = await act(async () => result.current.movePaths([]));
      expect(ok).toBe(false);
      expect(vi.mocked(invoke)).not.toHaveBeenCalled();
    });

    it("invokes move_paths with the normalized destination and returns true", async () => {
      const { result } = setup();
      vi.mocked(invoke).mockResolvedValue(undefined);
      const ok = await act(async () =>
        result.current.movePaths(["a.md", "b.md"], "dest"),
      );
      expect(ok).toBe(true);
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("move_paths", {
        sourcePaths: ["a.md", "b.md"],
        destinationRelPath: "dest",
      });
    });

    it("defaults an empty destination to an empty string", async () => {
      const { result } = setup();
      vi.mocked(invoke).mockResolvedValue(undefined);
      await act(async () => result.current.movePaths(["a.md"]));
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("move_paths", {
        sourcePaths: ["a.md"],
        destinationRelPath: "",
      });
    });
  });

  describe("pickAndSetVault", () => {
    it("sets the chosen vault, re-indexes, and invalidates the router", async () => {
      const { result, invalidate } = setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce("/vault")
        .mockResolvedValueOnce({
          vault_path: "/vault",
          note_count: 0,
          status: "full_index",
        });
      await act(async () => result.current.pickAndSetVault());
      expect(vi.mocked(invoke)).toHaveBeenNthCalledWith(1, "open_vault_dialog");
      expect(vi.mocked(invoke)).toHaveBeenNthCalledWith(2, "set_vault", {
        path: "/vault",
      });
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(result.current.isIndexing).toBe(false);
      expect(result.current.status).toBe(null);
    });

    it("bails out when the dialog returns null (no set_vault, no invalidate)", async () => {
      const { result, invalidate } = setup();
      vi.mocked(invoke).mockResolvedValue(null);
      await act(async () => result.current.pickAndSetVault());
      expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("open_vault_dialog");
      expect(invalidate).not.toHaveBeenCalled();
    });

    it("records an error status when set_vault fails", async () => {
      const { result } = setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce("/vault")
        .mockRejectedValue(new Error("nope"));
      await act(async () => result.current.pickAndSetVault());
      expect(result.current.status).toContain("Error");
    });
  });

  describe("reindexVault", () => {
    it("re-indexes and invalidates the router with a note count", async () => {
      const { result, invalidate } = setup();
      vi.mocked(invoke).mockResolvedValue({ note_count: 42 });
      await act(async () => result.current.reindexVault());
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("reindex_vault");
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("Re-indexed — 42 notes.");
    });

    it("records an error status when reindex fails", async () => {
      const { result } = setup();
      vi.mocked(invoke).mockRejectedValue(new Error("nope"));
      await act(async () => result.current.reindexVault());
      expect(result.current.status).toContain("Re-index error");
    });
  });
});
