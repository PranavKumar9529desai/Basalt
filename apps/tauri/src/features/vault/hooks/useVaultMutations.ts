import { invoke } from "@tauri-apps/api/core";
import { useRouter } from "@tanstack/react-router";
import type { FileNode } from "@workspace/ui/components/file-tree";
import { useCallback, useState } from "react";
import { useDeleteFlow } from "../lib/deleteFlow";
import type { BootResult, CreateNoteResult } from "../types";

const GHOST_ID = "__ghost__";

type GhostNode = FileNode & {
  parentRelPath?: string;
  path?: string;
  relPath?: string;
};

export interface UseVaultMutationsReturn {
  // Ghost / inline creation
  ghostNode: GhostNode | null;
  createNoteInline: (opts?: { parentRelPath?: string; depth?: number }) => void;
  createFolderInline: (opts?: {
    parentRelPath?: string;
    depth?: number;
  }) => void;
  clearGhost: () => void;
  // Inline rename (tree context-menu)
  /**
   * Node currently in rename mode (`isEditing`) — shown instead of the
   * regular row so the user can type a new name in place.
   */
  renamingNode: GhostNode | null;
  startRename: (node: GhostNode) => void;
  clearRename: () => void;
  // Note / folder creation (invoke backed)
  createNote: (
    name: string,
    parent?: string,
  ) => Promise<CreateNoteResult | null>;
  createUntitledNote: (parent?: string) => Promise<CreateNoteResult | null>;
  createUntitledCanvas: (parent?: string) => Promise<CreateNoteResult | null>;
  createFolder: (name: string, parent?: string) => Promise<string | null>;
  movePaths: (
    sourcePaths: string[],
    destinationRelPath?: string,
  ) => Promise<boolean>;
  // Delete
  isDeleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;
  pendingDeletePaths: string[];
  pendingDeletePath: string | null;
  pendingDeleteNames: string[];
  pendingDeleteName: string;
  requestDelete: (path: string, name: string) => void;
  requestDeleteMany: (items: Array<{ path: string; name: string }>) => void;
  confirmDelete: () => Promise<boolean>;
  // Vault-level actions
  isIndexing: boolean;
  status: string | null;
  setStatus: (msg: string | null) => void;
  pickAndSetVault: () => Promise<void>;
  reindexVault: () => Promise<void>;
  // Shared
  error: string | null;
  isLoading: boolean;
}

export function useVaultMutations(): UseVaultMutationsReturn {
  const router = useRouter();
  const [ghostNode, setGhostNode] = useState<GhostNode | null>(null);
  const [renamingNode, setRenamingNode] = useState<GhostNode | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const {
    isDeleteConfirmOpen,
    setDeleteConfirmOpen,
    pendingDeletePaths,
    pendingDeletePath,
    pendingDeleteNames,
    pendingDeleteName,
    requestDelete,
    requestDeleteMany,
    confirmDelete,
  } = useDeleteFlow({ setIsLoading, setError });

  // Vault-level actions — pick a new vault folder / full re-index. Both
  // re-run the route loader so the fresh boot result (with new tree)
  // propagates through props.
  const pickAndSetVault = useCallback(async () => {
    try {
      // Use the native Rust dialog command so we don't need the JS dialog plugin.
      const chosen = await invoke<string | null>("open_vault_dialog");
      if (!chosen) return;

      setIsIndexing(true);
      setStatus("Indexing vault…");

      await invoke<BootResult>("set_vault", { path: chosen });

      await router.invalidate();
      setStatus(null);
    } catch (err) {
      console.error("[useVaultMutations] set_vault failed:", err);
      setStatus(`Error: ${String(err)}`);
    } finally {
      setIsIndexing(false);
    }
  }, [router]);

  const reindexVault = useCallback(async () => {
    try {
      setIsIndexing(true);
      setStatus("Re-indexing…");

      const result = await invoke<{ note_count: number }>("reindex_vault");

      await router.invalidate();
      setStatus(`Re-indexed — ${result.note_count} notes.`);
    } catch (err) {
      console.error("[useVaultMutations] reindex_vault failed:", err);
      setStatus(`Re-index error: ${String(err)}`);
    } finally {
      setIsIndexing(false);
    }
  }, [router]);

  const createNoteInline = useCallback(
    (opts?: { parentRelPath?: string; depth?: number }) => {
      setGhostNode({
        id: GHOST_ID,
        name: "",
        isFolder: false,
        depth: opts?.depth ?? 0,
        parentRelPath: opts?.parentRelPath,
        isEditing: true,
      });
      setError(null);
    },
    [],
  );

  const createFolderInline = useCallback(
    (opts?: { parentRelPath?: string; depth?: number }) => {
      setGhostNode({
        id: GHOST_ID,
        name: "",
        isFolder: true,
        depth: opts?.depth ?? 0,
        parentRelPath: opts?.parentRelPath,
        isEditing: true,
      });
      setError(null);
    },
    [],
  );

  const clearGhost = useCallback(() => {
    setGhostNode(null);
  }, []);

  const startRename = useCallback((node: GhostNode) => {
    setRenamingNode({ ...node, isEditing: true });
    setError(null);
  }, []);

  const clearRename = useCallback(() => {
    setRenamingNode(null);
  }, []);

  const createNote = useCallback(
    async (name: string, parent?: string): Promise<CreateNoteResult | null> => {
      setError(null);
      setIsLoading(true);
      try {
        return await invoke<CreateNoteResult>("create_note", {
          name,
          parent: parent ?? null,
        });
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const createUntitledNote = useCallback(
    async (parent?: string): Promise<CreateNoteResult | null> => {
      setError(null);
      setIsLoading(true);
      try {
        return await invoke<CreateNoteResult>("create_untitled_note", {
          parent: parent ?? null,
        });
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );
  const createUntitledCanvas = useCallback(
    async (parent?: string): Promise<CreateNoteResult | null> => {
      setError(null);
      setIsLoading(true);
      try {
        return await invoke<CreateNoteResult>("create_untitled_canvas", {
          parent: parent ?? null,
        });
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const createFolder = useCallback(
    async (name: string, parent?: string): Promise<string | null> => {
      setError(null);
      setIsLoading(true);
      try {
        return await invoke<string>("create_folder", {
          name,
          parent: parent ?? null,
        });
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const movePaths = useCallback(
    async (sourcePaths: string[], destinationRelPath?: string) => {
      if (sourcePaths.length === 0) return false;
      setIsLoading(true);
      setError(null);
      try {
        await invoke("move_paths", {
          sourcePaths,
          destinationRelPath: destinationRelPath ?? "",
        });
        return true;
      } catch (err) {
        setError(String(err));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return {
    ghostNode,
    createNoteInline,
    createFolderInline,
    clearGhost,
    renamingNode,
    startRename,
    clearRename,
    createNote,
    createUntitledNote,
    createUntitledCanvas,
    createFolder,
    movePaths,
    isDeleteConfirmOpen,
    setDeleteConfirmOpen,
    pendingDeletePaths,
    pendingDeletePath,
    pendingDeleteNames,
    pendingDeleteName:
      pendingDeleteName ??
      (pendingDeleteNames.length > 1
        ? `${pendingDeleteNames.length} items`
        : (pendingDeleteNames[0] ?? "")),
    requestDelete,
    requestDeleteMany,
    confirmDelete,
    isIndexing,
    status,
    setStatus,
    pickAndSetVault,
    reindexVault,
    error,
    isLoading,
  };
}
