import type { FileNode } from "@workspace/ui/components/file-tree";
import type { FlatTreeNode } from "../../types";
import type { UseVaultMutationsReturn } from "../useVaultMutations";
import type { RenameTarget, VaultNoteController } from "./types";

export interface CommitActionsDeps {
  mutations: UseVaultMutationsReturn;
  parseInlineName: (
    raw: string,
    baseParent: string | undefined,
  ) => {
    leaf: string;
    parentRelPath: string;
    isFolder: boolean;
  } | null;
  resolveRenameName: (
    trimmed: string,
    targetName: string,
    isFolder: boolean,
  ) => string;
  vaultPath: string | null;
  openFolder: (relPath: string) => void;
  refreshTree: () => Promise<void>;
  editor: VaultNoteController;
  treeNodes: FlatTreeNode[];
  onRenameNode?: (target: RenameTarget, newName: string) => Promise<unknown>;
}

export interface CommitActions {
  handleCommitEdit: (
    node: FileNode & { parentRelPath?: string },
    newName: string,
  ) => Promise<void>;
  handleCancelEdit: () => void;
  handleCommitRename: (
    node: FileNode & { parentRelPath?: string },
    newName: string,
  ) => Promise<void>;
  handleCancelRename: () => void;
}

/** Inline create/edit + rename commit flows for the tree's editing row.
 * Commit-edit creates a real note/folder at the parsed path; commit-rename
 * resolves the target from the tree and routes the rename to the caller's
 * orchestrator (`onRenameNode`) so notes vs folders/attachments and open-tab
 * repointing stay cross-feature. */
export function createCommitActions(deps: CommitActionsDeps): CommitActions {
  const {
    mutations,
    parseInlineName,
    resolveRenameName,
    vaultPath,
    openFolder,
    refreshTree,
    editor,
    treeNodes,
    onRenameNode,
  } = deps;

  const handleCommitEdit = async (
    node: FileNode & { parentRelPath?: string },
    newName: string,
  ) => {
    mutations.clearGhost();
    const parsed = parseInlineName(newName, node.parentRelPath);
    if (!parsed) return;
    const { leaf, parentRelPath, isFolder } = parsed;

    if (isFolder || node.isFolder) {
      const folderPath = await mutations.createFolder(leaf, parentRelPath);
      if (folderPath && vaultPath) {
        const prefix = `${vaultPath}/`;
        const relPath = folderPath.startsWith(prefix)
          ? folderPath.slice(prefix.length)
          : folderPath;
        if (relPath) openFolder(relPath);
      }
      await refreshTree();
    } else {
      const result = await mutations.createNote(
        leaf,
        parentRelPath || undefined,
      );
      if (result)
        void editor.loadNote({ name: result.name, path: result.path });
      if (parentRelPath) openFolder(parentRelPath);
      await refreshTree();
    }
  };

  const handleCancelEdit = () => {
    mutations.clearGhost();
  };

  // Inline rename (context-menu Rename). The editing row lives at the node's
  // own path — no creation, no re-parenting — so the commit is just a
  // same-parent rename routed to the caller's orchestrator (which decides
  // rename_note vs rename_path and repoints open tabs).
  const handleCommitRename = async (
    node: FileNode & { parentRelPath?: string },
    newName: string,
  ) => {
    const trimmed = newName.trim();
    const target = treeNodes.find((n) => n.path === node.id);
    if (!target || !trimmed) {
      mutations.clearRename();
      return;
    }
    mutations.clearRename();
    const isFolder = node.isFolder ?? target.kind === "folder";
    if (trimmed === target.name) return;
    const newNameResolved = resolveRenameName(trimmed, target.name, isFolder);
    if (newNameResolved === target.name.replace(/\.md$/i, "")) return;
    void onRenameNode?.(
      { path: target.path, name: target.name, isFolder },
      newNameResolved,
    );
  };

  const handleCancelRename = () => {
    mutations.clearRename();
  };

  return {
    handleCommitEdit,
    handleCancelEdit,
    handleCommitRename,
    handleCancelRename,
  };
}
