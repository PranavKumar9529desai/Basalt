import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import type { CreateNoteResult } from "../types";
import type { FileNode } from "@workspace/ui/components/file-tree";

// Ghost node IDs — used to identify the ephemeral inline-edit node
const GHOST_ID = "__ghost__";

type GhostNode = FileNode & {
    parentRelPath?: string;
};

export interface UseVaultMutationsReturn {
    // ── Ghost node (inline create) ────────────────────────────────────
    /** The ghost node to inject into the tree, or null. */
    ghostNode: GhostNode | null;
    /** Start inline creation of a note (shows ghost input in the tree). */
    createNoteInline: (opts?: { parentRelPath?: string; depth?: number }) => void;
    /** Start inline creation of a folder. */
    createFolderInline: (opts?: { parentRelPath?: string; depth?: number }) => void;
    /** Remove the ghost node (cancel). */
    clearGhost: () => void;

    // ── Delete dialog state ───────────────────────────────────────────
    isDeleteConfirmOpen: boolean;
    setDeleteConfirmOpen: (open: boolean) => void;
    pendingDeletePath: string | null;
    pendingDeleteName: string | null;

    // ── Error state ───────────────────────────────────────────────────
    error: string | null;
    isLoading: boolean;

    // ── Actions ───────────────────────────────────────────────────────
    createNote: (name: string, parent?: string) => Promise<CreateNoteResult | null>;
    createFolder: (name: string, parent?: string) => Promise<string | null>;
    requestDelete: (path: string, name: string) => void;
    confirmDelete: () => Promise<boolean>;
}

export function useVaultMutations(): UseVaultMutationsReturn {
    // ── Ghost node state ────────────────────────────────────────────────
    const [ghostNode, setGhostNode] = useState<GhostNode | null>(null);

    // ── Delete dialog state ─────────────────────────────────────────────
    const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);
    const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);

    // ── Error / loading ─────────────────────────────────────────────────
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // ── Ghost node actions ──────────────────────────────────────────────
    const createNoteInline = useCallback((opts?: { parentRelPath?: string; depth?: number }) => {
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
    }, []);

    const createFolderInline = useCallback((opts?: { parentRelPath?: string; depth?: number }) => {
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
    }, []);

    const clearGhost = useCallback(() => {
        setGhostNode(null);
    }, []);

    // ── Create note (Rust invoke) ───────────────────────────────────────
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

    // ── Create folder (Rust invoke) ─────────────────────────────────────
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

    // ── Delete file ─────────────────────────────────────────────────────
    const requestDelete = useCallback((path: string, name: string) => {
        setPendingDeletePath(path);
        setPendingDeleteName(name);
        setDeleteConfirmOpen(true);
        setError(null);
    }, []);

    const confirmDelete = useCallback(async (): Promise<boolean> => {
        if (!pendingDeletePath) return false;
        setIsLoading(true);
        setError(null);
        try {
            await invoke("delete_file", { path: pendingDeletePath });
            setDeleteConfirmOpen(false);
            setPendingDeletePath(null);
            setPendingDeleteName(null);
            return true;
        } catch (err) {
            setError(String(err));
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [pendingDeletePath]);

    return {
        ghostNode,
        createNoteInline,
        createFolderInline,
        clearGhost,
        isDeleteConfirmOpen,
        setDeleteConfirmOpen,
        pendingDeletePath,
        pendingDeleteName,
        error,
        isLoading,
        createNote,
        createFolder,
        requestDelete,
        confirmDelete,
    };
}
