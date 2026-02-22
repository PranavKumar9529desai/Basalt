// ---------------------------------------------------------------------------
// Vault feature — barrel export
// Types
// ---------------------------------------------------------------------------
export type { FlatTreeNode, NodeKind, LinkSuggestion, SaveStatus, BootResult, FileChangeEvent } from "./types";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
export { useVaultTree } from "./hooks/useVaultTree";
export type { UseVaultTreeReturn } from "./hooks/useVaultTree";

export { useEditor } from "./hooks/useEditor";
export type { UseEditorReturn, UseEditorOptions } from "./hooks/useEditor";

export { useVaultActions } from "./hooks/useVaultActions";
export type { UseVaultActionsReturn } from "./hooks/useVaultActions";

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
export { FileTree } from "./components/FileTree";
export { FileTreeNode } from "./components/FileTreeNode";
export { Toolbar } from "./components/Toolbar";
export { BacklinksSidebar } from "./components/BacklinksSidebar";
export { SaveIndicator } from "./components/SaveIndicator";
export { VaultSplash } from "./components/VaultSplash";
