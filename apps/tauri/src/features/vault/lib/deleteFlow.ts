import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

/**
 * Note-deletion flow: confirmation staging (single + bulk) and the actual
 * delete invokes. Kept separate from the mutations hook so the delete state
 * machine reads as one unit; the shared busy/error flags stay in the hook,
 * which is why they're injected here.
 */

export interface DeleteFlowState {
  isDeleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;
  /** Absolute paths staged for deletion (bulk = many, single = one). */
  pendingDeletePaths: string[];
  /** First staged path, or null when nothing is pending. */
  pendingDeletePath: string | null;
  /** Display names staged for deletion. */
  pendingDeleteNames: string[];
  /** Label for the confirm dialog: single name or "N items". */
  pendingDeleteName: string;
  requestDelete: (path: string, name: string) => void;
  requestDeleteMany: (items: Array<{ path: string; name: string }>) => void;
  /** Runs the staged delete; resolves true when the invoke succeeded. */
  confirmDelete: () => Promise<boolean>;
}

/**
 * Callbacks into the owning hook's shared state — delete participates in the
 * same busy banner (`isLoading`) and error surface (`error`) as every other
 * vault mutation.
 */
export interface DeleteFlowCallbacks {
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export function useDeleteFlow({
  setIsLoading,
  setError,
}: DeleteFlowCallbacks): DeleteFlowState {
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(
    null,
  );
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([]);
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(
    null,
  );
  const [pendingDeleteNames, setPendingDeleteNames] = useState<string[]>([]);

  const requestDelete = useCallback(
    (path: string, name: string) => {
      setPendingDeletePaths([path]);
      setPendingDeleteNames([name]);
      setPendingDeletePath(path);
      setPendingDeleteName(name);
      setDeleteConfirmOpen(true);
      setError(null);
    },
    [setError],
  );

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
    [setError],
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
  }, [pendingDeletePath, pendingDeletePaths, setIsLoading, setError]);

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
  };
}
