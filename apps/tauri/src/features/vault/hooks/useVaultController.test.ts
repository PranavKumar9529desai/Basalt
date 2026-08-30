import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { FlatTreeNode } from "../types";
import type { FileNode } from "@workspace/ui/components/file-tree";
import type { UseVaultMutationsReturn } from "./useVaultMutations";

import { useVaultController } from "./useVaultController";
import type { UseVaultControllerOptions } from "./useVaultController";

function mouse(
  overrides: Partial<{
    clientX: number;
    clientY: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
  }> = {},
): ReactMouseEvent {
  return {
    clientX: 0,
    clientY: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...overrides,
  } as unknown as ReactMouseEvent;
}

function node(
  path: string,
  kind: "file" | "folder",
  depth = 0,
  name = path.split("/").pop() ?? path,
): FlatTreeNode {
  return { path, name, relPath: path, kind, depth, childCount: 0 };
}

function makeMutations(overrides: Partial<UseVaultMutationsReturn> = {}): UseVaultMutationsReturn {
  return {
    ghostNode: null,
    createNoteInline: vi.fn(),
    createFolderInline: vi.fn(),
    clearGhost: vi.fn(),
    createNote: vi.fn().mockResolvedValue(null),
    createUntitledNote: vi.fn().mockResolvedValue(null),
    createFolder: vi.fn().mockResolvedValue(null),
    movePaths: vi.fn().mockResolvedValue(false),
    isDeleteConfirmOpen: false,
    setDeleteConfirmOpen: vi.fn(),
    pendingDeletePaths: [],
    pendingDeletePath: null,
    pendingDeleteNames: [],
    pendingDeleteName: "",
    requestDelete: vi.fn(),
    requestDeleteMany: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(false),
    isIndexing: false,
    status: null,
    setStatus: vi.fn(),
    pickAndSetVault: vi.fn(),
    reindexVault: vi.fn(),
    error: null,
    isLoading: false,
    ...overrides,
  } as UseVaultMutationsReturn;
}

function setup(opts: Partial<UseVaultControllerOptions> = {}) {
  const mutations = opts.mutations ?? makeMutations();
  const editor =
    opts.editor ?? { selected: null, loadNote: vi.fn(), closeNote: vi.fn() };
  const onFileOpen = vi.fn();
  const onPathsMoved = vi.fn();
  const openFolder = vi.fn();
  const toggleFolder = vi.fn();
  const refreshTree = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useVaultController({
      treeNodes: [],
      visibleNodes: [],
      vaultPath: "/vault",
      editor,
      mutations,
      openFolder,
      toggleFolder,
      refreshTree,
      onFileOpen,
      onPathsMoved,
      ...opts,
    }),
  );
  return { result, mutations, editor, onFileOpen, onPathsMoved, openFolder, toggleFolder, refreshTree };
}

const A = node("a.md", "file", 0);
const B = node("b.md", "file", 1);
const C = node("c.md", "file", 2);
const FOLDER = node("dir", "folder", 0);

describe("useVaultController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("selection (via onTreeFileClick)", () => {
    it("selects a single node on a plain click and sets anchor + focus", () => {
      const { result } = setup({ visibleNodes: [A, B, C] });
      act(() => result.current.onTreeFileClick(A, mouse()));
      expect(result.current.selection.selectedIds.has("a.md")).toBe(true);
      expect(result.current.selection.selectedIds.size).toBe(1);
      expect(result.current.selection.anchorId).toBe("a.md");
      expect(result.current.selection.focusedId).toBe("a.md");
    });

    it("toggles membership on a meta/ctrl click", () => {
      const { result } = setup({ visibleNodes: [A, B, C] });
      act(() => result.current.onTreeFileClick(A, mouse()));
      act(() => result.current.onTreeFileClick(B, mouse({ metaKey: true })));
      expect(result.current.selection.selectedIds.has("a.md")).toBe(true);
      expect(result.current.selection.selectedIds.has("b.md")).toBe(true);
      act(() => result.current.onTreeFileClick(A, mouse({ ctrlKey: true })));
      expect(result.current.selection.selectedIds.has("a.md")).toBe(false);
      expect(result.current.selection.selectedIds.has("b.md")).toBe(true);
    });

    it("range-selects from the anchor on a shift click", () => {
      const { result } = setup({ visibleNodes: [A, B, C] });
      act(() => result.current.onTreeFileClick(A, mouse()));
      act(() => result.current.onTreeFileClick(C, mouse({ shiftKey: true })));
      expect(result.current.selection.selectedIds.has("a.md")).toBe(true);
      expect(result.current.selection.selectedIds.has("b.md")).toBe(true);
      expect(result.current.selection.selectedIds.has("c.md")).toBe(true);
    });

    it("opens in preview on a single click, pinned on a double click", () => {
      const { result, onFileOpen } = setup({ visibleNodes: [A] });
      act(() => result.current.onTreeFileClick(A, mouse()));
      act(() => result.current.onTreeFileClick(A, mouse()));
      expect(onFileOpen).toHaveBeenNthCalledWith(1, A, "preview");
      expect(onFileOpen).toHaveBeenNthCalledWith(2, A, "pinned");
    });

    it("falls back to editor.loadNote when no onFileOpen is provided", () => {
      const { result, editor } = setup({ visibleNodes: [A], onFileOpen: undefined });
      act(() => result.current.onTreeFileClick(A, mouse()));
      expect(editor.loadNote).toHaveBeenCalledWith({ name: "a.md", path: "a.md" });
    });
  });

  describe("context menu", () => {
    it("openForNode records the anchor, target, and multi-select flag", () => {
      const { result } = setup();
      act(() => result.current.contextMenu.openForNode(B, mouse({ clientX: 9, clientY: 11 }), false));
      const ms = result.current.contextMenu.menuState;
      expect(ms.anchor).toEqual({ x: 9, y: 11 });
      expect(ms.target?.kind).toBe("file");
      expect(ms.target?.node?.path).toBe("b.md");
      expect(result.current.contextMenu.isOpen).toBe(true);
    });

    it("openForRoot targets the root with no node", () => {
      const { result } = setup();
      act(() => result.current.contextMenu.openForRoot(mouse()));
      expect(result.current.contextMenu.menuState.target?.kind).toBe("root");
      expect(result.current.contextMenu.menuState.target?.node).toBe(null);
    });

    it("onTreeContextMenu selects the node and opens its menu", () => {
      const { result } = setup({ visibleNodes: [B] });
      act(() => result.current.onTreeContextMenu(B, mouse()));
      expect(result.current.contextMenu.menuState.target?.node?.path).toBe("b.md");
      expect(result.current.selection.selectedIds.has("b.md")).toBe(true);
    });

    it("reports isMultiSelect when the node is part of a multi-selection", () => {
      const { result } = setup({ visibleNodes: [A, B] });
      act(() => result.current.selection.setSelection(new Set([A.path, B.path])));
      act(() => result.current.onTreeContextMenu(B, mouse()));
      expect(result.current.contextMenu.menuState.isMultiSelect).toBe(true);
    });

    it("onTreeBackgroundContextMenu opens the root menu", () => {
      const { result } = setup();
      act(() => result.current.onTreeBackgroundContextMenu(mouse()));
      expect(result.current.contextMenu.menuState.target?.kind).toBe("root");
    });
  });

  describe("clipboard / cut", () => {
    it("onMenuCut stages the menu target as a cut item and closes the menu", () => {
      const { result } = setup();
      act(() => result.current.contextMenu.openForNode(A, mouse(), false));
      act(() => result.current.onMenuCut());
      expect(result.current.cutIds.has("a.md")).toBe(true);
      expect(result.current.contextMenu.menuState.target).toBe(null);
    });
  });

  describe("canPasteToMenuTarget", () => {
    it("is false with no cut items", () => {
      const { result } = setup();
      expect(result.current.canPasteToMenuTarget).toBe(false);
    });

    it("is false when the menu target is a file", () => {
      const { result } = setup();
      act(() => result.current.contextMenu.openForNode(A, mouse(), false));
      act(() => result.current.onMenuCut());
      act(() => result.current.contextMenu.openForNode(B, mouse(), false));
      expect(result.current.canPasteToMenuTarget).toBe(false);
    });

    it("is true when cutting a folder and targeting the root", () => {
      const { result } = setup();
      act(() => result.current.contextMenu.openForNode(FOLDER, mouse(), false));
      act(() => result.current.onMenuCut());
      act(() => result.current.contextMenu.openForRoot(mouse()));
      expect(result.current.canPasteToMenuTarget).toBe(true);
    });
  });

  describe("onMenuPaste", () => {
    it("moves paths, reports to onPathsMoved, clears clipboard, and refreshes", async () => {
      const { result, onPathsMoved, refreshTree, mutations } = setup({
        mutations: makeMutations({ movePaths: vi.fn().mockResolvedValue(true) }),
      });
      act(() => result.current.contextMenu.openForNode(FOLDER, mouse(), false));
      act(() => result.current.onMenuCut());
      act(() => result.current.contextMenu.openForRoot(mouse()));
      await act(async () => result.current.onMenuPaste());
      expect(mutations.movePaths).toHaveBeenCalledWith(["dir"], "");
      expect(onPathsMoved).toHaveBeenCalledWith(["dir"], "");
      expect(refreshTree).toHaveBeenCalled();
      expect(result.current.cutIds.size).toBe(0);
    });

    it("does nothing when movePaths reports failure", async () => {
      const { result, onPathsMoved } = setup({
        mutations: makeMutations({ movePaths: vi.fn().mockResolvedValue(false) }),
      });
      act(() => result.current.contextMenu.openForNode(FOLDER, mouse(), false));
      act(() => result.current.onMenuCut());
      act(() => result.current.contextMenu.openForRoot(mouse()));
      await act(async () => result.current.onMenuPaste());
      expect(onPathsMoved).not.toHaveBeenCalled();
      expect(result.current.cutIds.has("dir")).toBe(true);
    });
  });

  describe("onMenuDelete", () => {
    it("requests deletion of the menu target node", () => {
      const { result, mutations } = setup();
      act(() => result.current.contextMenu.openForNode(B, mouse(), false));
      act(() => result.current.onMenuDelete());
      expect(mutations.requestDelete).toHaveBeenCalledWith("b.md", "b.md");
    });

    it("requests deletion of the whole selection when multi-selected", () => {
      const { result, mutations } = setup({ treeNodes: [A, B] });
      act(() => result.current.selection.setSelection(new Set([A.path, B.path])));
      act(() => result.current.contextMenu.openForNode(B, mouse(), false));
      act(() => result.current.onMenuDelete());
      expect(mutations.requestDeleteMany).toHaveBeenCalledWith([
        { path: "a.md", name: "a.md" },
        { path: "b.md", name: "b.md" },
      ]);
    });
  });

  describe("handleConfirmDelete", () => {
    it("refreshes and closes the editor note when the selected note was deleted", async () => {
      const { result, mutations, editor, refreshTree } = setup({
        editor: { selected: { path: "del/a.md", name: "a" }, loadNote: vi.fn(), closeNote: vi.fn() },
        mutations: makeMutations({
          confirmDelete: vi.fn().mockResolvedValue(true),
          pendingDeletePaths: ["del/a.md"],
        }),
      });
      await act(async () => result.current.handleConfirmDelete());
      expect(mutations.confirmDelete).toHaveBeenCalled();
      expect(refreshTree).toHaveBeenCalled();
      expect(editor.closeNote).toHaveBeenCalled();
    });

    it("skips refresh when deletion is cancelled", async () => {
      const { result, editor, refreshTree } = setup({
        editor: { selected: { path: "del/a.md", name: "a" }, loadNote: vi.fn(), closeNote: vi.fn() },
        mutations: makeMutations({ confirmDelete: vi.fn().mockResolvedValue(false) }),
      });
      await act(async () => result.current.handleConfirmDelete());
      expect(refreshTree).not.toHaveBeenCalled();
      expect(editor.closeNote).not.toHaveBeenCalled();
    });
  });

  describe("handleDeleteFromCommands", () => {
    it("deletes the selection when one exists", () => {
      const { result, mutations } = setup({ treeNodes: [A, B] });
      act(() => result.current.selection.setSelection(new Set([A.path, B.path])));
      act(() => result.current.handleDeleteFromCommands());
      expect(mutations.requestDeleteMany).toHaveBeenCalled();
    });

    it("falls back to the editor-selected note when nothing is selected", () => {
      const { result, mutations } = setup({
        editor: { selected: { path: "del/a.md", name: "a" }, loadNote: vi.fn(), closeNote: vi.fn() },
      });
      act(() => result.current.handleDeleteFromCommands());
      expect(mutations.requestDelete).toHaveBeenCalledWith("del/a.md", "a");
    });
  });

  describe("createNoteInstant", () => {
    it("creates an untitled note under the selected note's parent, opens the folder, and loads it", async () => {
      const { result, mutations, openFolder, refreshTree, editor } = setup({
        treeNodes: [node("dir/a.md", "file", 1)],
        editor: { selected: { path: "dir/a.md", name: "a" }, loadNote: vi.fn(), closeNote: vi.fn() },
        mutations: makeMutations({
          createUntitledNote: vi.fn().mockResolvedValue({ path: "dir/new.md", name: "new" }),
        }),
      });
      await act(async () => result.current.createNoteInstant());
      expect(mutations.createUntitledNote).toHaveBeenCalledWith("dir");
      expect(openFolder).toHaveBeenCalledWith("dir");
      expect(editor.loadNote).toHaveBeenCalledWith({
        name: "new",
        path: "dir/new.md",
        renameOnOpen: true,
      });
      expect(refreshTree).toHaveBeenCalled();
    });
  });

  describe("startFolderInline", () => {
    it("seeds a folder ghost under the selected note's parent", () => {
      const { result, mutations, openFolder } = setup({
        treeNodes: [node("dir/a.md", "file", 1)],
        editor: { selected: { path: "dir/a.md", name: "a" }, loadNote: vi.fn(), closeNote: vi.fn() },
      });
      act(() => result.current.startFolderInline());
      expect(mutations.createFolderInline).toHaveBeenCalledWith({ parentRelPath: "dir", depth: 1 });
      expect(openFolder).toHaveBeenCalledWith("dir");
    });
  });

  describe("handleCommitEdit", () => {
    const fileNode = (parentRelPath: string): FileNode & { parentRelPath?: string } =>
      ({ id: "x", name: "x", isFolder: false, depth: 0, parentRelPath }) as unknown as FileNode & {
        parentRelPath?: string;
      };

    it("renames a file via createNote and opens its parent", async () => {
      const { result, mutations, openFolder, refreshTree } = setup({
        treeNodes: [node("dir/a.md", "file", 1)],
      });
      await act(async () =>
        result.current.handleCommitEdit(fileNode("dir"), "renamed.md"),
      );
      expect(mutations.clearGhost).toHaveBeenCalled();
      expect(mutations.createNote).toHaveBeenCalledWith("renamed.md", "dir");
      expect(openFolder).toHaveBeenCalledWith("dir");
      expect(refreshTree).toHaveBeenCalled();
    });

    it("creates a folder when the name ends with a slash", async () => {
      const { result, mutations, openFolder } = setup({
        vaultPath: "/vault",
        treeNodes: [node("dir/a.md", "file", 1)],
        mutations: makeMutations({
          createFolder: vi.fn().mockResolvedValue("/vault/dir/newfolder"),
        }),
      });
      await act(async () => result.current.handleCommitEdit(fileNode("dir"), "newfolder/"));
      expect(mutations.createFolder).toHaveBeenCalledWith("newfolder", "dir");
      expect(openFolder).toHaveBeenCalledWith("dir/newfolder");
    });

    it("supports nested relative names", async () => {
      const { result, mutations } = setup();
      await act(async () =>
        result.current.handleCommitEdit(fileNode("dir"), "sub/renamed.md"),
      );
      expect(mutations.createNote).toHaveBeenCalledWith("renamed.md", "dir/sub");
    });
  });

  describe("handleCancelEdit", () => {
    it("clears the ghost node", () => {
      const { result, mutations } = setup();
      act(() => result.current.handleCancelEdit());
      expect(mutations.clearGhost).toHaveBeenCalled();
    });
  });

  describe("onTreeFolderToggle", () => {
    it("toggles the folder and selects it", () => {
      const { result, toggleFolder } = setup();
      act(() => result.current.onTreeFolderToggle(FOLDER, mouse()));
      expect(toggleFolder).toHaveBeenCalledWith("dir");
      expect(result.current.selection.selectedIds.has("dir")).toBe(true);
    });
  });

  describe("isMultiSelectContextMenu", () => {
    it("reflects the context menu's multi-select flag", () => {
      const { result } = setup();
      act(() => result.current.contextMenu.openForNode(A, mouse(), true));
      expect(result.current.isMultiSelectContextMenu).toBe(true);
    });
  });
});
