import { useCallback } from "react";
import type {
  TabClickOpenBehavior,
  TabGroupId,
  TabGroupModel,
  TabModel,
} from "../../tabs";
import { useTabsStore } from "../../tabs";
import type { FlatTreeNode } from "../../vault";
import { useVaultController, useVaultMutations } from "../../vault";

interface NoteSelection {
  path: string;
  name: string;
}

interface EditorInterface {
  focusedSessionSelected: NoteSelection | null;
  focusedSessionTab: TabModel | null;
  groups: Record<TabGroupId, TabGroupModel>;
  openInPreview: (opts: { path: string; title: string }) => string;
  openPinned: (opts: { path: string; title: string }) => string;
  setTabTitle: (tabId: string, title: string) => void;
  closeTab: (
    groupId: TabGroupId,
    tabId: string,
    opts: { force: boolean },
  ) => void;
  tabClickOpenBehavior: TabClickOpenBehavior;
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

export function useWorkspaceSidebar({
  vaultPath,
  treeNodes,
  visibleNodes,
  openFolder,
  toggleFolder,
  refreshTree,
  editor,
}: Props) {
  const mutations = useVaultMutations();

  const controller = useVaultController({
    treeNodes,
    visibleNodes,
    vaultPath,
    editor: {
      selected: editor.focusedSessionSelected
        ? {
            name: editor.focusedSessionSelected.name,
            path: editor.focusedSessionSelected.path,
          }
        : null,
      loadNote: (note) => {
        const tabId = editor.openInPreview({
          path: note.path,
          title: note.name,
        });
        editor.setTabTitle(tabId, note.name);
      },
      closeNote: () => {
        const tab = editor.focusedSessionTab;
        if (!tab) return;
        for (const group of Object.values(editor.groups)) {
          if (group.tabIds.includes(tab.id)) {
            editor.closeTab(group.id, tab.id, { force: true });
            break;
          }
        }
      },
    },
    mutations,
    openFolder,
    toggleFolder,
    refreshTree,
    onFileOpen: (node, mode) => {
      const effectiveMode =
        editor.tabClickOpenBehavior === "vscode"
          ? mode
          : editor.tabClickOpenBehavior;
      const tabId =
        effectiveMode === "pinned"
          ? editor.openPinned({ path: node.path, title: node.name })
          : editor.openInPreview({ path: node.path, title: node.name });
      editor.setTabTitle(tabId, node.name);
    },
  });

  const handleConfirmDeleteWithTabs = useCallback(async () => {
    const deletedPaths = [...mutations.pendingDeletePaths];
    await controller.handleConfirmDelete();

    const state = useTabsStore.getState();
    for (const path of deletedPaths) {
      const tabId = `tab:${path}`;
      for (const group of Object.values(state.groups)) {
        if (group.tabIds.includes(tabId)) {
          state.closeTab(group.id, tabId, { force: true });
          break;
        }
      }
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
