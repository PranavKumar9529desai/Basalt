import type { UseVaultMutationsReturn } from "../useVaultMutations";
import type { VaultNoteController } from "./types";

export interface CreateActionsDeps {
  deriveParentContext: () => { parentRelPath: string; depth: number };
  editor: VaultNoteController;
  mutations: UseVaultMutationsReturn;
  openFolder: (relPath: string) => void;
  refreshTree: () => Promise<void>;
}

export interface CreateActions {
  createNoteInstant: () => Promise<void>;
  createCanvasInstant: () => Promise<void>;
  createDrawingInstant: () => Promise<void>;
  startFolderInline: () => void;
}

/** Instant-create actions for the tree (note/canvas/drawing/folder) — every one
 * derives its destination from the focused/selected node, opens that folder,
 * and for notes loads the fresh file with the one-time title-rename flag. */
export function createCreateActions(deps: CreateActionsDeps): CreateActions {
  const { deriveParentContext, editor, mutations, openFolder, refreshTree } =
    deps;

  const createNoteInstant = async () => {
    const ctx = deriveParentContext();
    if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
    const result = await mutations.createUntitledNote(
      ctx.parentRelPath || undefined,
    );
    if (!result) return;
    void editor.loadNote({
      name: result.name,
      path: result.path,
      renameOnOpen: true,
    });
    await refreshTree();
  };

  const createCanvasInstant = async () => {
    const ctx = deriveParentContext();
    if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
    const result = await mutations.createUntitledCanvas(
      ctx.parentRelPath || undefined,
    );
    if (!result) return;
    void editor.loadNote({
      name: result.name,
      path: result.path,
      renameOnOpen: true,
    });
    await refreshTree();
  };

  const createDrawingInstant = async () => {
    const ctx = deriveParentContext();
    if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
    const result = await mutations.createUntitledDrawing(
      ctx.parentRelPath || undefined,
    );
    if (!result) return;
    void editor.loadNote({
      name: result.name,
      path: result.path,
      renameOnOpen: true,
    });
    await refreshTree();
  };

  const startFolderInline = () => {
    const ctx = deriveParentContext();
    if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
    mutations.createFolderInline(ctx);
  };

  return { createNoteInstant, createCanvasInstant, createDrawingInstant, startFolderInline };
}
