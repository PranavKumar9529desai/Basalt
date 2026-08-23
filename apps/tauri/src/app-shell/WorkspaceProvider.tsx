import { useFocusedPaneStore } from "../features/editor";
import {
  getTabByPath,
  useTabsStore,
} from "../features/tabs";
import {
  findNoteByName,
  useVaultTree,
  type FlatTreeNode,
} from "../features/vault";
import { useWorkspace } from "../shared/useWorkspace";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

// ---------------------------------------------------------------------------
// WorkspaceProvider — the "app context" for workbench views (ADR-018).
//
// Owns the single instance of the cross-feature composition (vault tree
// state + useWorkspace controller/mutations) and exposes it to views via
// context. Views consume this instead of receiving prop drills from the
// shell — the same role Obsidian's `app` object plays for its views, and
// the surface future plugins will receive.
//
// There is exactly ONE provider (mounted by WorkspaceView); hooks like
// useWorkspace hold state (contextMenu, selection) and must never be
// instantiated twice.
// ---------------------------------------------------------------------------

function useWorkspaceState(vaultPath: string, initialTree: FlatTreeNode[]) {
  const tree = useVaultTree(initialTree);
  const { treeNodes, visibleNodes, toggleFolder, openFolder, refreshTree } =
    tree;

  const focusedSessionSelected = useFocusedPaneStore(
    (s) => s.focusedPaneSelected,
  );
  const pane = useTabsStore((s) => s.pane);
  const tabsRecord = useTabsStore((s) => s.tabs);
  const openInPreview = useTabsStore((s) => s.openInPreview);
  const openPinned = useTabsStore((s) => s.openPinned);
  const setTabTitle = useTabsStore((s) => s.setTabTitle);
  const closeTab = useTabsStore((s) => s.closeTab);

  const focusedSessionTab = useMemo(
    () =>
      focusedSessionSelected?.path
        ? getTabByPath(pane, tabsRecord, focusedSessionSelected.path)
        : null,
    [focusedSessionSelected?.path, pane, tabsRecord],
  );

  const workspace = useWorkspace({
    vaultPath,
    treeNodes,
    visibleNodes,
    openFolder,
    toggleFolder,
    refreshTree,
    editor: {
      focusedSessionSelected,
      focusedSessionTab,
      openInPreview,
      openPinned,
      setTabTitle,
      closeTab,
    },
  });

  const findNote = useCallback(
    (name: string) => findNoteByName(treeNodes, name),
    [treeNodes],
  );

  // Open a note by path in a preview tab (used by search, backlinks, and
  // any view that needs "open this note").
  const openNotePreview = useCallback(
    (path: string) => {
      const node = treeNodes.find((n) => n.kind === "file" && n.path === path);
      if (!node) return;
      const tabId = openInPreview({ path: node.path, title: node.name });
      setTabTitle(tabId, node.name);
    },
    [treeNodes, openInPreview, setTabTitle],
  );

  return {
    vaultPath,
    ...tree,
    ...workspace,
    focusedSessionTab,
    findNote,
    openNotePreview,
  };
}

export type WorkspaceContextValue = ReturnType<typeof useWorkspaceState>;

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  vaultPath,
  initialTree,
  children,
}: {
  vaultPath: string;
  initialTree: FlatTreeNode[];
  children: ReactNode;
}) {
  const value = useWorkspaceState(vaultPath, initialTree);
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceContext must be used within a WorkspaceProvider",
    );
  }
  return ctx;
}
