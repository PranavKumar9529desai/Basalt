import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "@workspace/ui/components/file-tree";
import { useCallback, useState } from "react";
import type { CreateNoteResult } from "../types";

const GHOST_ID = "__ghost__";

type GhostNode = FileNode & {
  parentRelPath?: string;
};

export interface UseVaultCreateMutationsReturn {
  ghostNode: GhostNode | null;
  createNoteInline: (opts?: { parentRelPath?: string; depth?: number }) => void;
  createFolderInline: (opts?: {
    parentRelPath?: string;
    depth?: number;
  }) => void;
  clearGhost: () => void;
  createNote: (
    name: string,
    parent?: string,
  ) => Promise<CreateNoteResult | null>;
  createFolder: (name: string, parent?: string) => Promise<string | null>;
  movePaths: (
    sourcePaths: string[],
    destinationRelPath?: string,
  ) => Promise<boolean>;
  error: string | null;
  isLoading: boolean;
}

export function useVaultCreateMutations(): UseVaultCreateMutationsReturn {
  const [ghostNode, setGhostNode] = useState<GhostNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const createNoteInline = useCallback(
    (opts?: { parentRelPath?: string; depth?: number }) => {
      const depth = opts?.depth ?? 0;
      setGhostNode({
        id: GHOST_ID,
        name: "",
        isFolder: false,
        depth,
        parentRelPath: opts?.parentRelPath,
        isEditing: true,
      });
      setError(null);
    },
    [],
  );

  const createFolderInline = useCallback(
    (opts?: { parentRelPath?: string; depth?: number }) => {
      const depth = opts?.depth ?? 0;
      setGhostNode({
        id: GHOST_ID,
        name: "",
        isFolder: true,
        depth,
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

  const createNote = useCallback(
    async (name: string, parent?: string): Promise<CreateNoteResult | null> => {
      setError(null);
      setIsLoading(true);
      try {
        const result = await invoke<CreateNoteResult>("create_note", {
          name,
          parent: parent ?? null,
        });
        return result;
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
        const result = await invoke<string>("create_folder", {
          name,
          parent: parent ?? null,
        });
        return result;
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
    createNote,
    createFolder,
    movePaths,
    error,
    isLoading,
  };
}
