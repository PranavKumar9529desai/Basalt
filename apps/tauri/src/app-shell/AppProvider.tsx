import { useActiveNoteStore } from "../features/editor";
import { getTabByPath, useTabsStore } from "../features/tabs";
import {
  findNoteByName,
  useVaultTree,
  type FlatTreeNode,
} from "../features/vault";
import { useWorkspace } from "../shared/useWorkspace";
import { type ReactNode, createContext, useCallback, useContext } from "react";

function useWorkspaceState(vaultPath: string, initialTree: FlatTreeNode[]) {
  const tree = useVaultTree(initialTree);
  const { treeNodes, visibleNodes, toggleFolder, openFolder, refreshTree } =
    tree;

  const activeNote = useActiveNoteStore((s) => s.activeNote);
  const activeNoteBacklinks = useActiveNoteStore((s) => s.activeNoteBacklinks);
  const activeNotePath = activeNote?.path ?? null;
  const openInPreview = useTabsStore((s) => s.openInPreview);
  const openPinned = useTabsStore((s) => s.openPinned);
  const setTabTitle = useTabsStore((s) => s.setTabTitle);
  const closeTab = useTabsStore((s) => s.closeTab);

  // Select ONLY the tab for the active note's path (a single TabModel ref),
  // never the whole tabs/pane records. zustand re-renders when the returned
  // value changes (Object.is), so picking one tab reference means unrelated
  // tab/pane mutations — markTabDirty / setTabTitle on other tabs, activateTab
  // between notes — don't re-render the whole app shell.
  const activeNoteTab = useTabsStore((s) =>
    activeNotePath ? getTabByPath(s.pane, s.tabs, activeNotePath) : null,
  );

  const workspace = useWorkspace({
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
    (path: string, line?: number) => {
      const node = treeNodes.find((n) => n.kind === "file" && n.path === path);
      const name = node?.name ?? path.split("/").pop() ?? path;
      const tabId = openInPreview({
        path,
        title: name,
        line,
        focusOnOpen: true,
      });
      setTabTitle(tabId, name);
    },
    [treeNodes, openInPreview, setTabTitle],
  );

  return {
    vaultPath,
    ...tree,
    ...workspace,
    activeNoteTab,
    activeNote,
    activeNoteBacklinks,
    findNote,
    openNote,
  };
}

export type AppContextValue = ReturnType<typeof useWorkspaceState>;

const AppContext = createContext<AppContextValue | null>(null);

/**
 * App context for workbench views (ADR-018): owns the single instance of the
 * cross-feature composition (vault tree + useWorkspace) and exposes
 * it via context instead of prop drills — the role Obsidian's `app` object
 * plays for its views, and the surface future plugins will receive. Mount
 * exactly once (Shell); the hooks underneath hold state and must
 * never be instantiated twice.
 */
export function AppProvider({
  vaultPath,
  initialTree,
  children,
}: {
  vaultPath: string;
  initialTree: FlatTreeNode[];
  children: ReactNode;
}) {
  const value = useWorkspaceState(vaultPath, initialTree);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return ctx;
}
