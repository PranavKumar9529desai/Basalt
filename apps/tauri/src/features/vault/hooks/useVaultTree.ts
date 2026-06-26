import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileChangeEvent, FlatTreeNode } from "../types";

/**
 * Find a file node by its display name (with or without .md extension).
 * Searches the flat tree — used by the editor to resolve wikilinks via
 * filename. Exported as a pure utility so callers don't need the hook.
 */
export function findNoteByName(
  treeNodes: FlatTreeNode[],
  name: string,
): FlatTreeNode | undefined {
  return treeNodes.find(
    (n) => n.kind === "file" && (n.name === name || n.name === `${name}.md`),
  );
}

export interface UseVaultTreeReturn {
  /** The full flat tree as built by Rust — pre-sorted, pre-annotated. */
  treeNodes: FlatTreeNode[];

  /** Set of folder rel_paths the user has explicitly opened. Pure UI state. */
  openFolders: Set<string>;

  /**
   * Derived: only the nodes currently visible given the open-folder state.
   * Computed in O(n) — folders filter out their collapsed descendants.
   * This is what gets rendered.
   */
  visibleNodes: FlatTreeNode[];

  /** Replace the tree (e.g. after the loader re-runs). */
  setTreeNodes: (nodes: FlatTreeNode[]) => void;

  /**
   * Toggle a folder open/closed.
   * Closing a folder also recursively removes all of its descendant
   * folders from `openFolders` so the visibility check stays correct.
   */
  toggleFolder: (relPath: string) => void;

  /**
   * Force a folder (and its ancestors) open.
   * Useful after creating a folder so it appears immediately.
   */
  openFolder: (relPath: string) => void;

  /**
   * Re-fetch the tree from Rust and update state.
   * Call this after any `vault://file-changed` event or explicit re-index.
   */
  refreshTree: () => Promise<void>;
}

/**
 * Owns all tree state.
 *
 * Responsibilities:
 *   - Store the flat tree received from Rust
 *   - Track which folders the user has opened (pure UI state — never sent to Rust)
 *   - Derive `visibleNodes` from the above two
 *   - Listen to `vault://file-changed` and refresh the tree automatically
 *
 * The frontend never constructs, sorts, or annotates tree nodes — that is
 * entirely Rust's responsibility.  This hook only answers: "given the tree
 * Rust built, which rows should be visible right now?"
 */
export function useVaultTree(initialTree: FlatTreeNode[]): UseVaultTreeReturn {
  const [treeNodes, setTreeNodes] = useState<FlatTreeNode[]>(initialTree);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  // ── Visibility derivation ──────────────────────────────────────────────
  // A node is visible when ALL of its ancestor folders are open.
  // We enforce this invariant on the `openFolders` set itself: when a folder
  // is closed we remove all its descendants from the set.  That means we only
  // need to check the immediate parent here, keeping this O(n).

  const visibleNodes = useMemo<FlatTreeNode[]>(() => {
    return treeNodes.filter((node) => {
      // Root-level nodes (depth 0) are always visible.
      if (node.depth === 0) return true;

      // Derive the immediate parent's rel_path by dropping the last segment.
      const lastSlash = node.relPath.lastIndexOf("/");
      const parentRel =
        lastSlash === -1 ? "" : node.relPath.slice(0, lastSlash);

      return openFolders.has(parentRel);
    });
  }, [treeNodes, openFolders]);

  // ── Toggle ─────────────────────────────────────────────────────────────

  const toggleFolder = useCallback((relPath: string) => {
    setOpenFolders((prev) => {
      const isOpen = prev.has(relPath);
      const next = new Set(prev);

      if (isOpen) {
        // Close: remove this folder AND all descendant folders so that their
        // children don't stay "visible" even after the parent collapses.
        const prefix = `${relPath}/`;
        for (const p of next) {
          if (p === relPath || p.startsWith(prefix)) {
            next.delete(p);
          }
        }
      } else {
        // Open: simply add this folder's rel_path.
        next.add(relPath);
      }

      return next;
    });
  }, []);

  // Open a folder and all ancestors.
  const openFolder = useCallback((relPath: string) => {
    if (!relPath) return;
    const parts = relPath.split("/").filter(Boolean);
    setOpenFolders((prev) => {
      const next = new Set(prev);
      let acc = "";
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        next.add(acc);
      }
      return next;
    });
  }, []);

  // ── Tree refresh ───────────────────────────────────────────────────────

  const refreshTree = useCallback(async () => {
    try {
      const tree = await invoke<FlatTreeNode[]>("get_vault_tree");
      setTreeNodes(tree);
    } catch (err) {
      console.error("[useVaultTree] get_vault_tree failed:", err);
    }
  }, []);

  // ── Automatic refresh on file-system changes ───────────────────────────
  //
  // The Rust watcher emits `vault://file-changed` whenever a .md file is
  // created, modified, or deleted.  We re-fetch the full tree so the sidebar
  // always reflects the real file system without any manual "re-index".

  useEffect(() => {
    const unlistenPromise = listen<FileChangeEvent>(
      "vault://file-changed",
      () => {
        refreshTree();
      },
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [refreshTree]);

  return {
    treeNodes,
    openFolders,
    visibleNodes,
    setTreeNodes,
    toggleFolder,
    openFolder,
    refreshTree,
  };
}
