import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import type { CreateNoteResult } from "../types";

export interface UseVaultMutationsReturn {
    // ── Dialog state ──────────────────────────────────────────────────
    isCreateNoteOpen: boolean;
    setCreateNoteOpen: (open: boolean) => void;
    isCreateFolderOpen: boolean;
    setCreateFolderOpen: (open: boolean) => void;
    isDeleteConfirmOpen: boolean;
    setDeleteConfirmOpen: (open: boolean) => void;

    /** The path of the file pending deletion (set before confirm dialog opens). */
    pendingDeletePath: string | null;
    pendingDeleteName: string | null;

    // ── Error state ───────────────────────────────────────────────────
    error: string | null;
    isLoading: boolean;

    // ── Actions ───────────────────────────────────────────────────────
    /**
     * Create a new note. Returns the result on success so the caller
     * can immediately open it in the editor.
     * @param name — note title (without .md)
     * @param parent — optional relative folder path
     */
    createNote: (name: string, parent?: string) => Promise<CreateNoteResult | null>;

    /**
     * Create a new folder.
     * @param name — folder name
     * @param parent — optional relative parent folder path
     */
    createFolder: (name: string, parent?: string) => Promise<string | null>;

    /**
     * Request deletion of a file. Opens the confirm dialog.
     * Call `confirmDelete()` after user confirms.
     */
    requestDelete: (path: string, name: string) => void;

    /**
     * Execute the pending deletion after user confirms.
     */
    confirmDelete: () => Promise<boolean>;
}

export function useVaultMutations(): UseVaultMutationsReturn {
    // ── Dialog state ────────────────────────────────────────────────────
    const [isCreateNoteOpen, setCreateNoteOpen] = useState(false);
    const [isCreateFolderOpen, setCreateFolderOpen] = useState(false);
    const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);
    const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);

    // ── Error / loading ─────────────────────────────────────────────────
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // ── Create note ─────────────────────────────────────────────────────
    const createNote = useCallback(
        async (name: string, parent?: string): Promise<CreateNoteResult | null> => {
            setError(null);
            setIsLoading(true);
            try {
                const result = await invoke<CreateNoteResult>("create_note", {
                    name,
                    parent: parent ?? null,
                });
                setCreateNoteOpen(false);
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

    // ── Create folder ───────────────────────────────────────────────────
    const createFolder = useCallback(
        async (name: string, parent?: string): Promise<string | null> => {
            setError(null);
            setIsLoading(true);
            try {
                const result = await invoke<string>("create_folder", {
                    name,
                    parent: parent ?? null,
                });
                setCreateFolderOpen(false);
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
        isCreateNoteOpen,
        setCreateNoteOpen,
        isCreateFolderOpen,
        setCreateFolderOpen,
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
