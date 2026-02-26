// ---------------------------------------------------------------------------
// Vault feature — barrel export
// Types
// ---------------------------------------------------------------------------

export { BacklinksSidebar } from "./components/BacklinksSidebar";
// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
export { FileTree } from "./components/FileTree";
export { SaveIndicator } from "./components/SaveIndicator";
export { Toolbar } from "./components/Toolbar";
export { VaultSplash } from "./components/VaultSplash";
export type {
  UseEditorOptions,
  UseEditorReturn,
} from "../editor/hooks/useEditor";
export { useEditor } from "../editor/hooks/useEditor";
export type { UseVaultActionsReturn } from "./hooks/useVaultActions";
export { useVaultActions } from "./hooks/useVaultActions";
export type { UseVaultTreeReturn } from "./hooks/useVaultTree";

export { useVaultTree } from "./hooks/useVaultTree";
export type {
  BootResult,
  FileChangeEvent,
  FlatTreeNode,
  LinkSuggestion,
  NodeKind,
  SaveStatus,
} from "./types";
