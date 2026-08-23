/**
 * useWorkspace — Cross-feature orchestrator.
 *
 * Architecture: This hook owns ALL cross-feature wiring between vault, tabs,
 * editor, and settings. It reads from multiple feature stores and composes
 * their APIs into higher-level operations (e.g., "open a file in the
 * editor" = vault node click → tabs.openInPreview → setTabTitle).
 *
 * This lives in `shared/` (not `features/`) because it imports from
 * multiple features — vault, tabs, editor, and settings. Features must
 * never import from each other directly; cross-feature composition
 * belongs here or in `app-shell/`.
 *
 * Callers pass in raw feature data (treeNodes, visibleNodes, vaultPath)
 * and editor interface callbacks. This hook returns composed controller
 * actions and UI state for the shell to render.
 */
import { useCallback, useMemo } from "react";
import type { TabModel } from "../features/tabs";
import {
  tabIdFromPath,
  useTabsStore,
} from "../features/tabs";
import type { FlatTreeNode } from "../features/vault";
import { useVaultController, useVaultMutations } from "../features/vault";
import { useSetting } from "../features/settings";

interface NoteSelection {
  path: string;
  name: string;
}

interface EditorInterface {
  focusedSessionSelected: NoteSelection | null;
  focusedSessionTab: TabModel | null;
  openInPreview: (opts: { path: string; title: string }) => string;
  openPinned: (opts: { path: string; title: string }) => string;
  setTabTitle: (tabId: string, title: string) => void;
  closeTab: (tabId: string, opts: { force: boolean }) => void;
}

interface Props {
  vaultPath: string | null;
  treeNodes: FlatTreeNode[];
  visibleNodes: FlatTreeNode[];
  openFolder: (id: string) => void;
  toggleFolder: (id: string) => void;
  refreshTree: () => Promise<void>;
  editor: EditorInterface;
}

export function useWorkspace({
  vaultPath,
  treeNodes,
  visibleNodes,
  openFolder,
  toggleFolder,
  refreshTree,
  editor,
}: Props) {
  const mutations = useVaultMutations();

  // Destructure stable action references so inline callbacks stay stable.
  const {
    openInPreview,
    openPinned,
    setTabTitle,
    closeTab,
    focusedSessionTab,
    focusedSessionSelected,
  } = editor;

  const tabClickOpenBehavior = useSetting("tabClickOpenBehavior");

  // loadNote only depends on stable store actions — never changes.
  const loadNote = useCallback(
    (note: { path: string; name: string }) => {
      const tabId = openInPreview({ path: note.path, title: note.name });
      setTabTitle(tabId, note.name);
    },
    [openInPreview, setTabTitle],
  );

  // closeNote — single pane, just close the tab directly.
  const closeNote = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    closeTab(tab.id, { force: true });
  }, [focusedSessionTab, closeTab]);

  // onFileOpen only depends on stable store actions — never changes.
  const onFileOpen = useCallback(
    (node: FlatTreeNode, mode: "preview" | "pinned") => {
      const effectiveMode =
        tabClickOpenBehavior === "vscode" ? mode : tabClickOpenBehavior;
      const tabId =
        effectiveMode === "pinned"
          ? openPinned({ path: node.path, title: node.name })
          : openInPreview({ path: node.path, title: node.name });
      setTabTitle(tabId, node.name);
    },
    [tabClickOpenBehavior, openPinned, openInPreview, setTabTitle],
  );

  // Memoize the editor object so it doesn't cause useVaultController to
  // recreate its callbacks when the reference changes but the values don't.
  const vaultControllerEditor = useMemo(
    () => ({
      selected: focusedSessionSelected
        ? {
            name: focusedSessionSelected.name,
            path: focusedSessionSelected.path,
          }
        : null,
      loadNote,
      closeNote,
    }),
    [focusedSessionSelected, loadNote, closeNote],
  );

  const controller = useVaultController({
    treeNodes,
    visibleNodes,
    vaultPath,
    editor: vaultControllerEditor,
    mutations,
    openFolder,
    toggleFolder,
    refreshTree,
    onFileOpen,
  });

  const handleConfirmDeleteWithTabs = useCallback(async () => {
    const deletedPaths = [...mutations.pendingDeletePaths];
    await controller.handleConfirmDelete();

    const state = useTabsStore.getState();
    for (const path of deletedPaths) {
      const tabId = tabIdFromPath(path);
      state.closeTab(tabId, { force: true });
    }
  }, [controller.handleConfirmDelete, mutations.pendingDeletePaths]);

  return {
    controller,
    mutations,
    contextMenu: controller.contextMenu,
    selection: controller.selection,
    handleConfirmDeleteWithTabs,
  };
}
