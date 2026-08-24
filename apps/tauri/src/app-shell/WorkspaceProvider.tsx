import { useActiveNoteStore } from "../features/editor";
import {
  getTabByPath,
  useTabsStore,
} from "../features/tabs";
import {
  findNoteByName,
  useVaultTree,
  type FlatTreeNode,
} from "../features/vault";
import { useWorkspaceController } from "../shared/useWorkspace";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

function useWorkspaceState(vaultPath: string, initialTree: FlatTreeNode[]) {
  const tree = useVaultTree(initialTree);
  const { treeNodes, visibleNodes, toggleFolder, openFolder, refreshTree } =
    tree;

  const activeNote = useActiveNoteStore((s) => s.activeNote);
  const pane = useTabsStore((s) => s.pane);
  const tabsRecord = useTabsStore((s) => s.tabs);
  const openInPreview = useTabsStore((s) => s.openInPreview);
  const openPinned = useTabsStore((s) => s.openPinned);
  const setTabTitle = useTabsStore((s) => s.setTabTitle);
  const closeTab = useTabsStore((s) => s.closeTab);

  const activeNoteTab = useMemo(
    () =>
      activeNote?.path
        ? getTabByPath(pane, tabsRecord, activeNote.path)
        : null,
    [activeNote?.path, pane, tabsRecord],
  );

  const workspace = useWorkspaceController({
    vaultPath,
    treeNodes,
    visibleNodes,
    openFolder,
    toggleFolder,
    refreshTree,
    editor: {
      activeNote,
      activeNoteTab,
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

  // Open a note by path — the single entry point for wikilinks, backlinks,
  // search, and any view that needs "open this note". Title resolves from
  // the tree, falling back to the path's basename.
  const openNote = useCallback(
    (path: string) => {
      const node = treeNodes.find((n) => n.kind === "file" && n.path === path);
      const name = node?.name ?? path.split("/").pop() ?? path;
      const tabId = openInPreview({ path, title: name });
      setTabTitle(tabId, name);
    },
    [treeNodes, openInPreview, setTabTitle],
  );

  return {
    vaultPath,
    ...tree,
    ...workspace,
    activeNoteTab,
    findNote,
    openNote,
  };
}

export type WorkspaceContextValue = ReturnType<typeof useWorkspaceState>;

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * App context for workbench views (ADR-018): owns the single instance of the
 * cross-feature composition (vault tree + useWorkspaceController) and exposes
 * it via context instead of prop drills — the role Obsidian's `app` object
 * plays for its views, and the surface future plugins will receive. Mount
 * exactly once (WorkspaceView); the hooks underneath hold state and must
 * never be instantiated twice.
 */
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
