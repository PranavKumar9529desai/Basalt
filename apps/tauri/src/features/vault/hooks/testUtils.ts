import { vi } from "vitest";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { FlatTreeNode } from "../types";
import type { UseVaultMutationsReturn } from "./useVaultMutations";

export function mouse(
  overrides: Partial<{
    clientX: number;
    clientY: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
  }> = {},
): ReactMouseEvent {
  return {
    clientX: 0,
    clientY: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...overrides,
  } as unknown as ReactMouseEvent;
}

export function node(
  path: string,
  kind: "file" | "folder",
  depth = 0,
  name = path.split("/").pop() ?? path,
): FlatTreeNode {
  return { path, name, relPath: path, kind, depth, childCount: 0 };
}

export function makeMutations(
  overrides: Partial<UseVaultMutationsReturn> = {},
): UseVaultMutationsReturn {
  return {
    ghostNode: null,
    createNoteInline: vi.fn(),
    createFolderInline: vi.fn(),
    clearGhost: vi.fn(),
    createNote: vi.fn().mockResolvedValue(null),
    createUntitledNote: vi.fn().mockResolvedValue(null),
    createFolder: vi.fn().mockResolvedValue(null),
    movePaths: vi.fn().mockResolvedValue(false),
    isDeleteConfirmOpen: false,
    setDeleteConfirmOpen: vi.fn(),
    pendingDeletePaths: [],
    pendingDeletePath: null,
    pendingDeleteNames: [],
    pendingDeleteName: "",
    requestDelete: vi.fn(),
    requestDeleteMany: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(false),
    isIndexing: false,
    status: null,
    setStatus: vi.fn(),
    pickAndSetVault: vi.fn(),
    reindexVault: vi.fn(),
    error: null,
    isLoading: false,
    ...overrides,
  } as UseVaultMutationsReturn;
}
