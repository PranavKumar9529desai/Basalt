// ---------------------------------------------------------------------------
// Vault feature — barrel export
// Types
// ---------------------------------------------------------------------------

export { BacklinksSidebar } from "./components/BacklinksSidebar";
export { FileTree } from "./components/FileTree";
export { SaveIndicator } from "./components/SaveIndicator";

export { VaultSplash } from "./components/VaultSplash";
export type {
  UseEditorOptions,
  UseEditorReturn,
} from "../editor/hooks/useEditor";
export { useEditor } from "../editor/hooks/useEditor";
export type { UseVaultActionsReturn } from "./hooks/useVaultActions";
export { useVaultActions } from "./hooks/useVaultActions";
export type { UseVaultMutationsReturn } from "./hooks/useVaultMutations";
export { useVaultMutations } from "./hooks/useVaultMutations";
export type { UseVaultTreeReturn } from "./hooks/useVaultTree";

export { useVaultTree } from "./hooks/useVaultTree";
export type {
  BootResult,
  FileChangeEvent,
  FlatTreeNode,
  LinkSuggestion,
  NodeKind,
  SaveStatus,
  CreateNoteResult,
} from "./types";
