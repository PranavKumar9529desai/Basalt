// ---------------------------------------------------------------------------
// Vault feature — barrel export
// Types
// ---------------------------------------------------------------------------

export type {
  UseEditorOptions,
  UseEditorReturn,
} from "../editor/hooks/useEditor";
export { useEditor } from "../editor/hooks/useEditor";
export { BacklinksSidebar } from "./components/BacklinksSidebar";
export { FileTree } from "./components/FileTree";
export { SaveIndicator } from "./components/SaveIndicator";
export { VaultSplash } from "./components/VaultSplash";
export type { UseVaultActionsReturn } from "./hooks/useVaultActions";
export { useVaultActions } from "./hooks/useVaultActions";
export type { UseVaultClipboardReturn } from "./hooks/useVaultClipboard";
export { useVaultClipboard } from "./hooks/useVaultClipboard";
export type { UseVaultContextMenuReturn } from "./hooks/useVaultContextMenu";
export { useVaultContextMenu } from "./hooks/useVaultContextMenu";
export type { UseVaultCreateMutationsReturn } from "./hooks/useVaultCreateMutations";
export { useVaultCreateMutations } from "./hooks/useVaultCreateMutations";
export type { UseVaultDeleteMutationsReturn } from "./hooks/useVaultDeleteMutations";
export { useVaultDeleteMutations } from "./hooks/useVaultDeleteMutations";
export type { UseVaultFileTreeControllerReturn } from "./hooks/useVaultFileTreeController";
export { useVaultFileTreeController } from "./hooks/useVaultFileTreeController";
export type { UseVaultMutationsReturn } from "./hooks/useVaultMutations";
export { useVaultMutations } from "./hooks/useVaultMutations";
export type { UseVaultTreeReturn } from "./hooks/useVaultTree";

export { useVaultTree } from "./hooks/useVaultTree";
export type {
  BootResult,
  CreateNoteResult,
  FileChangeEvent,
  FlatTreeNode,
  LinkSuggestion,
  NodeKind,
  SaveStatus,
} from "./types";
