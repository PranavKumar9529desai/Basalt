// ---------------------------------------------------------------------------
// Vault feature — barrel export
// ---------------------------------------------------------------------------

export { BacklinksSidebar } from "./components/BacklinksSidebar";
export { FileTree } from "./components/FileTree";
export { SaveIndicator } from "./components/SaveIndicator";
export { VaultSplash } from "./components/VaultSplash";
export type { UseVaultActionsReturn } from "./hooks/useVaultActions";
export { useVaultActions } from "./hooks/useVaultActions";
export type { UseVaultControllerReturn } from "./hooks/useVaultController";
export { useVaultController } from "./hooks/useVaultController";
export type { UseVaultMutationsReturn } from "./hooks/useVaultMutations";
export { useVaultMutations } from "./hooks/useVaultMutations";
export type { UseVaultTreeReturn } from "./hooks/useVaultTree";
export { findNoteByName, useVaultTree } from "./hooks/useVaultTree";
export type {
  BootResult,
  CreateNoteResult,
  FileChangeEvent,
  FlatTreeNode,
  LinkSuggestion,
  NodeKind,
  SaveStatus,
} from "./types";
