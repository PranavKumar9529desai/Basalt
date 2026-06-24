// ---------------------------------------------------------------------------
// useVaultMutations — merged create + delete mutations
// Previously split across useVaultCreateMutations + useVaultDeleteMutations +
// a wrapper useVaultMutations. Now one file.
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "@workspace/ui/components/file-tree";
import { useCallback, useState } from "react";
import type { CreateNoteResult } from "../types";

const GHOST_ID = "__ghost__";

type GhostNode = FileNode & { parentRelPath?: string };

export interface UseVaultMutationsReturn {
  // Ghost / inline creation
  ghostNode: GhostNode | null;
  createNoteInline: (opts?: { parentRelPath?: string; depth?: number }) => void;
  createFolderInline: (opts?: {
    parentRelPath?: string;
    depth?: number;
  }) => void;
  clearGhost: () => void;
  // Note / folder creation (invoke backed)
  createNote: (
    name: string,
    parent?: string,
  ) => Promise<CreateNoteResult | null>;
  createUntitledNote: (parent?: string) => Promise<CreateNoteResult | null>;
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
  // Shared
  error: string | null;
  isLoading: boolean;
}

export function useVaultMutations(): UseVaultMutationsReturn {
  // --- Ghost state ---
  const [ghostNode, setGhostNode] = useState<GhostNode | null>(null);

  // --- Delete state ---
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(
    null,
  );
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([]);
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(
    null,
  );
  const [pendingDeleteNames, setPendingDeleteNames] = useState<string[]>([]);

  // --- Shared ---
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ---- Ghost/inline creation ----

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

  // ---- Create (invoke-backed) ----

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

  // ---- Delete ----

  const requestDelete = useCallback((path: string, name: string) => {
    setPendingDeletePaths([path]);
    setPendingDeleteNames([name]);
    setPendingDeletePath(path);
    setPendingDeleteName(name);
    setDeleteConfirmOpen(true);
    setError(null);
  }, []);

  const requestDeleteMany = useCallback(
    (items: Array<{ path: string; name: string }>) => {
      if (items.length === 0) return;
      setPendingDeletePaths(items.map((item) => item.path));
      setPendingDeleteNames(items.map((item) => item.name));
      setPendingDeletePath(items[0]?.path ?? null);
      setPendingDeleteName(
        items.length === 1 ? items[0].name : `${items.length} items`,
      );
      setDeleteConfirmOpen(true);
      setError(null);
    },
    [],
  );

  const confirmDelete = useCallback(async (): Promise<boolean> => {
    const paths =
      pendingDeletePaths.length > 0
        ? pendingDeletePaths
        : pendingDeletePath
          ? [pendingDeletePath]
          : [];
    if (paths.length === 0) return false;

    setIsLoading(true);
    setError(null);
    try {
      if (paths.length === 1) {
        await invoke("delete_file", { path: paths[0] });
      } else {
        await invoke("delete_paths", { paths });
      }
      setDeleteConfirmOpen(false);
      setPendingDeletePaths([]);
      setPendingDeleteNames([]);
      setPendingDeletePath(null);
      setPendingDeleteName(null);
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [pendingDeletePath, pendingDeletePaths]);

  return {
    ghostNode,
    createNoteInline,
    createFolderInline,
    clearGhost,
    createNote,
    createUntitledNote,
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
    error,
    isLoading,
  };
}
