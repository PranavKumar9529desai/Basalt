import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { FlatTreeNode } from "../features/vault";
import type { TabModel } from "../features/tabs";
import type { TabClickOpenBehavior } from "../features/settings/settings-data";
import type { UseVaultMutationsReturn } from "../features/vault/hooks/useVaultMutations";
import type { UseVaultControllerReturn } from "../features/vault/hooks/useVaultController";
import type { TabsState } from "../features/tabs/store/types";

import { useWorkspace } from "./useWorkspace";

vi.mock("../features/vault", () => ({
  useVaultMutations: vi.fn(),
  useVaultController: vi.fn(),
}));
vi.mock("../features/settings", () => ({
  useSetting: vi.fn(),
}));
vi.mock("../features/tabs", () => ({
  useTabsStore: { getState: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { useVaultMutations, useVaultController } from "../features/vault";
import { useSetting } from "../features/settings";
import { useTabsStore } from "../features/tabs";
import { invoke } from "@tauri-apps/api/core";

interface EditorInterface {
  activeNote: { path: string; name: string } | null;
  activeNoteTab: TabModel | null;
  openInPreview: (opts: { path: string; title: string }) => string;
  openPinned: (opts: { path: string; title: string }) => string;
  setTabTitle: (tabId: string, title: string) => void;
  closeTab: (tabId: string, opts: { force: boolean }) => void;
}
type MockEditor = Omit<
  EditorInterface,
  "openInPreview" | "openPinned" | "setTabTitle" | "closeTab"
> & {
  openInPreview: Mock<(opts: { path: string; title: string }) => string>;
  openPinned: Mock<(opts: { path: string; title: string }) => string>;
  setTabTitle: Mock<(tabId: string, title: string) => void>;
  closeTab: Mock<(tabId: string, opts: { force: boolean }) => void>;
};

interface CapturedControllerOpts {
  editor: {
    loadNote: (note: { path: string; name: string; renameOnOpen?: boolean }) => void;
    closeNote: () => void;
  };
  onFileOpen: (node: FlatTreeNode, mode: "preview" | "pinned") => void;
  onPathsMoved: (sourcePaths: string[], destinationRelPath: string) => void;
}

function makeEditor(
  overrides: Partial<Pick<EditorInterface, "activeNote" | "activeNoteTab">> = {},
): MockEditor {
  return {
    activeNote: null,
    activeNoteTab: null,
    openInPreview: vi.fn(({ path }: { path: string; title: string }) => `preview:${path}`),
    openPinned: vi.fn(({ path }: { path: string; title: string }) => `pinned:${path}`),
    setTabTitle: vi.fn((_tabId: string, _title: string) => {}),
    closeTab: vi.fn((_tabId: string, _opts: { force: boolean }) => {}),
    ...overrides,
  };
}

interface SetupOpts {
  setting?: string;
  vaultPath?: string | null;
  editor?: Partial<Pick<EditorInterface, "activeNote" | "activeNoteTab">>;
  pendingDeletePaths?: string[];
  tabs?: Record<string, unknown>;
}

function setup(opts: SetupOpts = {}) {
  const editor = makeEditor(opts.editor);
  vi.mocked(useSetting).mockReturnValue(
    (opts.setting ?? "preview") as TabClickOpenBehavior,
  );
  vi.mocked(useVaultMutations).mockReturnValue({
    pendingDeletePaths: opts.pendingDeletePaths ?? [],
  } as unknown as UseVaultMutationsReturn);

  const handleConfirmDelete = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useVaultController).mockReturnValue({
    contextMenu: {},
    selection: {},
    handleConfirmDelete,
  } as unknown as UseVaultControllerReturn);

  const updateTabPaths = vi.fn();
  const closeTab = vi.fn();
  vi.mocked(useTabsStore.getState).mockReturnValue({
    tabs: opts.tabs ?? {},
    updateTabPaths,
    closeTab,
  } as unknown as TabsState);

  const refreshTree = vi.fn().mockResolvedValue(undefined);

  const { result } = renderHook(() =>
    useWorkspace({
      vaultPath: opts.vaultPath === undefined ? "/vault" : opts.vaultPath,
      treeNodes: [],
      visibleNodes: [],
      openFolder: vi.fn(),
      toggleFolder: vi.fn(),
      refreshTree,
      editor,
    }),
  );

  const controllerOpts = vi.mocked(useVaultController).mock.calls[0][0] as unknown as CapturedControllerOpts;
  return { result, editor, handleConfirmDelete, updateTabPaths, closeTab, controllerOpts, refreshTree };
}

const node = (path: string, name: string) =>
  ({ path, name } as unknown as FlatTreeNode);

describe("useWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadNote", () => {
    it("opens in preview then sets the tab title to the note name", () => {
      const { editor, controllerOpts } = setup();
      editor.openInPreview.mockReturnValue("tab-1");
      controllerOpts.editor.loadNote({ path: "a/b.md", name: "b" });
      expect(editor.openInPreview).toHaveBeenCalledWith({ path: "a/b.md", title: "b" });
      expect(editor.setTabTitle).toHaveBeenCalledWith("tab-1", "b");
    });

    it("forwards renameOnOpen to openInPreview (note creation)", () => {
      const { editor, controllerOpts } = setup();
      editor.openInPreview.mockReturnValue("tab-1");
      controllerOpts.editor.loadNote({
        path: "a/b.md",
        name: "b",
        renameOnOpen: true,
      });
      expect(editor.openInPreview).toHaveBeenCalledWith({
        path: "a/b.md",
        title: "b",
        renameOnOpen: true,
      });
    });
  });

  describe("renameNote", () => {
    it("refreshes the tree and repoints the tab on success, returning the new path", async () => {
      const { result, refreshTree, updateTabPaths } = setup();
      vi.mocked(invoke).mockResolvedValue({
        path: "/vault/renamed.md",
        name: "renamed",
        updated_files: ["/vault/other.md"],
      });

      const out = await result.current.renameNote(
        { id: "t1", path: "/vault/old.md" },
        "renamed",
      );

      expect(out).toEqual({ ok: true, path: "/vault/renamed.md" });
      expect(refreshTree).toHaveBeenCalledTimes(1);
      expect(updateTabPaths).toHaveBeenCalledWith([
        { from: "/vault/old.md", to: "/vault/renamed.md" },
      ]);
    });

    it("returns {ok:false} with the backend error and does not touch tabs or tree on failure", async () => {
      const { result, refreshTree, updateTabPaths } = setup();
      vi.mocked(invoke).mockRejectedValue(new Error("a note named 'old' already exists"));

      const out = await result.current.renameNote(
        { id: "t1", path: "/vault/old.md" },
        "renamed",
      );

      expect(out).toEqual({
        ok: false,
        error: "a note named 'old' already exists",
      });
      expect(refreshTree).not.toHaveBeenCalled();
      expect(updateTabPaths).not.toHaveBeenCalled();
    });
  });

  describe("onFileOpen", () => {
    it("vscode behavior respects the mode arg (pinned)", () => {
      const { editor, controllerOpts } = setup({ setting: "vscode" });
      controllerOpts.onFileOpen(node("x.md", "x"), "pinned");
      expect(editor.openPinned).toHaveBeenCalledWith({ path: "x.md", title: "x" });
      expect(editor.setTabTitle).toHaveBeenCalledWith("pinned:x.md", "x");
    });

    it("vscode behavior respects the mode arg (preview)", () => {
      const { editor, controllerOpts } = setup({ setting: "vscode" });
      controllerOpts.onFileOpen(node("x.md", "x"), "preview");
      expect(editor.openInPreview).toHaveBeenCalledWith({ path: "x.md", title: "x" });
    });

    it("preview behavior overrides the mode arg and opens in preview", () => {
      const { editor, controllerOpts } = setup({ setting: "preview" });
      controllerOpts.onFileOpen(node("x.md", "x"), "pinned");
      expect(editor.openInPreview).toHaveBeenCalledWith({ path: "x.md", title: "x" });
      expect(editor.openPinned).not.toHaveBeenCalled();
    });

    it("pinned behavior overrides the mode arg and opens pinned", () => {
      const { editor, controllerOpts } = setup({ setting: "pinned" });
      controllerOpts.onFileOpen(node("x.md", "x"), "preview");
      expect(editor.openPinned).toHaveBeenCalledWith({ path: "x.md", title: "x" });
      expect(editor.openInPreview).not.toHaveBeenCalled();
    });
  });

  describe("closeNote", () => {
    it("no-ops when there is no active note tab", () => {
      const { editor, controllerOpts } = setup({ editor: { activeNoteTab: null } });
      controllerOpts.editor.closeNote();
      expect(editor.closeTab).not.toHaveBeenCalled();
    });

    it("closes the active tab with force when present", () => {
      const activeNoteTab = { id: "tab-7", path: "x.md" } as unknown as TabModel;
      const { editor, controllerOpts } = setup({ editor: { activeNoteTab } });
      controllerOpts.editor.closeNote();
      expect(editor.closeTab).toHaveBeenCalledWith("tab-7", { force: true });
    });
  });

  describe("handlePathsMoved", () => {
    const tabs = {
      t1: { id: "t1", path: "src/a.md" },
      t2: { id: "t2", path: "src/b/c.md" },
      t3: { id: "t3", path: "other/d.md" },
    };

    it("repoints nested tab paths under the destination without changing ids", () => {
      const { controllerOpts, updateTabPaths } = setup({ tabs });
      controllerOpts.onPathsMoved(["src"], "moved");
      expect(updateTabPaths).toHaveBeenCalledWith([
        { from: "src/a.md", to: "/vault/moved/a.md" },
        { from: "src/b/c.md", to: "/vault/moved/b/c.md" },
      ]);
      // t3 has no source match, and updateTabPaths carries only from/to (ids survive)
      expect(updateTabPaths.mock.calls[0][0]).toHaveLength(2);
    });

    it("treats an empty destination as the vault root", () => {
      const { controllerOpts, updateTabPaths } = setup({ tabs });
      controllerOpts.onPathsMoved(["src"], "");
      expect(updateTabPaths).toHaveBeenCalledWith([
        { from: "src/a.md", to: "/vault/a.md" },
        { from: "src/b/c.md", to: "/vault/b/c.md" },
      ]);
    });

    it("matches an exact source path, not only a startsWith prefix", () => {
      const { controllerOpts, updateTabPaths } = setup({
        tabs: { t4: { id: "t4", path: "src" } },
      });
      controllerOpts.onPathsMoved(["src"], "moved");
      expect(updateTabPaths).toHaveBeenCalledWith([{ from: "src", to: "/vault/moved" }]);
    });

    it("no-ops when vaultPath is null", () => {
      const { controllerOpts, updateTabPaths } = setup({ vaultPath: null, tabs });
      controllerOpts.onPathsMoved(["src"], "moved");
      expect(updateTabPaths).not.toHaveBeenCalled();
    });

    it("does not call updateTabPaths when no tab matches a source", () => {
      const { controllerOpts, updateTabPaths } = setup({ tabs });
      controllerOpts.onPathsMoved(["nowhere"], "moved");
      expect(updateTabPaths).not.toHaveBeenCalled();
    });
  });

  describe("handleConfirmDeleteWithTabs", () => {
    it("closes tabs by path match after confirming delete", async () => {
      const { result, closeTab, handleConfirmDelete } = setup({
        pendingDeletePaths: ["del/a.md", "del/b.md"],
        tabs: {
          t1: { id: "t1", path: "del/a.md" },
          t2: { id: "t2", path: "keep.md" },
          t3: { id: "t3", path: "del/b.md" },
        },
      });
      await result.current.handleConfirmDeleteWithTabs();
      expect(handleConfirmDelete).toHaveBeenCalledTimes(1);
      expect(closeTab).toHaveBeenCalledWith("t1", { force: true });
      expect(closeTab).toHaveBeenCalledWith("t3", { force: true });
      expect(closeTab).not.toHaveBeenCalledWith("t2", { force: true });
    });
  });
});
