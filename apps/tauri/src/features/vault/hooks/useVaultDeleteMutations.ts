import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

export interface UseVaultDeleteMutationsReturn {
  isDeleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;
  pendingDeletePaths: string[];
  pendingDeletePath: string | null;
  pendingDeleteNames: string[];
  pendingDeleteName: string;
  requestDelete: (path: string, name: string) => void;
  requestDeleteMany: (items: Array<{ path: string; name: string }>) => void;
  confirmDelete: () => Promise<boolean>;
  error: string | null;
  isLoading: boolean;
}

export function useVaultDeleteMutations(): UseVaultDeleteMutationsReturn {
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(
    null,
  );
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(
    null,
  );
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([]);
  const [pendingDeleteNames, setPendingDeleteNames] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
