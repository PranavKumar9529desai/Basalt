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
 * actions and UI state for the shell to render. Consume it via
 * useAppContext() — never instantiate a second time.
 */
import { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RenameResult } from "@workspace/views";
import type { TabModel } from "../features/tabs";
import { useTabsStore } from "../features/tabs";
import type { FlatTreeNode } from "../features/vault";
import { useVaultController, useVaultMutations } from "../features/vault";
import { useSetting } from "../features/settings";

interface NoteSelection {
  path: string;
  name: string;
  /** Transient: enter the note's title-rename flow on open (note creation). */
  renameOnOpen?: boolean;
}

interface EditorInterface {
  activeNote: NoteSelection | null;
  activeNoteTab: TabModel | null;
  openInPreview: (opts: {
    path: string;
    title: string;
    renameOnOpen?: boolean;
  }) => string;
  openPinned: (opts: { path: string; title: string }) => string;
  setTabTitle: (tabId: string, title: string) => void;
  closeTab: (tabId: string, opts: { force: boolean }) => void;
}

/** Backend `rename_note` / `rename_path` result. `moved` only exists on
 *  folder renames (every relocated .md document, old → new absolute pair). */
interface RenameNodeResult {
  path: string;
  name: string;
  updated_files: string[];
  moved?: Array<[string, string]>;
}

/** A tree item targeted for rename (see `RenameTarget` in the vault feature). */
interface RenameNodeTarget {
  path: string;
  name: string;
  isFolder: boolean;
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
    activeNoteTab,
    activeNote,
  } = editor;

  const tabClickOpenBehavior = useSetting("tabClickOpenBehavior");

  // loadNote only depends on stable store actions — never changes.
  const loadNote = useCallback(
    (note: { path: string; name: string; renameOnOpen?: boolean }) => {
      const tabId = openInPreview({
        path: note.path,
        title: note.name,
        renameOnOpen: note.renameOnOpen,
      });
      setTabTitle(tabId, note.name);
    },
    [openInPreview, setTabTitle],
  );

  // closeNote — single pane, just close the tab directly.
  const closeNote = useCallback(() => {
    const tab = activeNoteTab;
    if (!tab) return;
    closeTab(tab.id, { force: true });
  }, [activeNoteTab, closeTab]);

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
      selected: activeNote
        ? {
            name: activeNote.name,
            path: activeNote.path,
          }
        : null,
      loadNote,
      closeNote,
    }),
    [activeNote, loadNote, closeNote],
  );

  // Repoint open tabs after a move/paste. Tab ids are stable; only path
  // and title change, so leaf EditorState caches (keyed by id) — including
  // unsaved edits in dirty tabs — survive the move.
  const handlePathsMoved = useCallback(
    (sourcePaths: string[], destinationRelPath: string) => {
      if (!vaultPath) return;
      const destAbs = destinationRelPath
        ? `${vaultPath}/${destinationRelPath}`
        : vaultPath;
      const state = useTabsStore.getState();
      const moves: Array<{ from: string; to: string }> = [];
      for (const tab of Object.values(state.tabs)) {
        const source = sourcePaths.find(
          (s) => tab.path === s || tab.path.startsWith(`${s}/`),
        );
        if (!source) continue;
        moves.push({
          from: tab.path,
          to: `${destAbs}${tab.path.slice(source.length)}`,
        });
      }
      if (moves.length > 0) state.updateTabPaths(moves);
    },
    [vaultPath],
  );

  // Tree context-menu rename: notes go through rename_note (wikilink rewrite
  // by stem); folders and attachments through rename_path (folder renames
  // rewrite vault-relative path links and move every nested document). After
  // the backend returns, refresh the tree, repoint any open tab tracking the
  // renamed path (`moved` covers every document that relocated), and open the
  // freshly-named folder so the sidebar lands on the renamed item.
  const renameNode = useCallback(
    async (
      target: RenameNodeTarget,
      newName: string,
    ): Promise<RenameResult> => {
      try {
        const isNote =
          !target.isFolder && target.name.toUpperCase().endsWith(".MD");
        const result: RenameNodeResult = isNote
          ? await invoke<RenameNodeResult>("rename_note", {
              path: target.path,
              newName,
            })
          : await invoke<RenameNodeResult>("rename_path", {
              path: target.path,
              newName,
            });

        await refreshTree();

        const state = useTabsStore.getState();
        const moves: Array<{ from: string; to: string }> = [
          { from: target.path, to: result.path },
        ];
        if (result.moved) {
          moves.push(...result.moved.map(([from, to]) => ({ from, to })));
        }
        if (moves.length > 0) state.updateTabPaths(moves);

        if (target.isFolder && vaultPath) {
          const prefix = `${vaultPath}/`;
          const rel = result.path.startsWith(prefix)
            ? result.path.slice(prefix.length)
            : result.path;
          if (rel) openFolder(rel);
        }
        return { ok: true, path: result.path };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [refreshTree, vaultPath, openFolder],
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
    onPathsMoved: handlePathsMoved,
    onRenameNode: renameNode,
  });

  // Destructure so the callback depends on the stable method, not the
  // controller object (which is re-created every render by design).
  const { handleConfirmDelete } = controller;
  const handleConfirmDeleteWithTabs = useCallback(async () => {
    const deletedPaths = [...mutations.pendingDeletePaths];
    await handleConfirmDelete();

    // Close by path match, not id derivation: tab ids can be stale after a
    // move repointed paths in place (updateTabPaths keeps original ids).
    const state = useTabsStore.getState();
    for (const tab of Object.values(state.tabs)) {
      if (deletedPaths.includes(tab.path)) {
        state.closeTab(tab.id, { force: true });
      }
    }
  }, [handleConfirmDelete, mutations.pendingDeletePaths]);

  // Inline-title rename: invoke the Rust rename (rewrites wikilinks in other
  // notes), refresh the tree so the new name appears, and repoint the tab's
  // path in place (id stays stable → leaf editor caches and dirty state
  // survive). The new absolute path comes from the backend result.
  const renameNote = useCallback(
    async (
      tab: { id: string; path: string },
      newName: string,
    ): Promise<RenameResult> => {
      try {
        const result = await invoke<{
          path: string;
          name: string;
          updated_files: string[];
        }>("rename_note", { path: tab.path, newName });
        await refreshTree();
        const state = useTabsStore.getState();
        state.updateTabPaths([{ from: tab.path, to: result.path }]);
        return { ok: true, path: result.path };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
    [refreshTree],
  );

  return {
    controller,
    mutations,
    contextMenu: controller.contextMenu,
    selection: controller.selection,
    handleConfirmDeleteWithTabs,
    renameNote,
    renameNode,
  };
}
