import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Editor } from "@workspace/editor";
import { useCallback, useEffect } from "react";
import { FileTree } from "../features/vault/components/FileTree";
import { SaveIndicator } from "../features/vault/components/SaveIndicator";
import { Toolbar } from "../features/vault/components/Toolbar";
import { VaultSplash } from "../features/vault/components/VaultSplash";
import { useEditor } from "../features/vault/hooks/useEditor";
import { useVaultActions } from "../features/vault/hooks/useVaultActions";
import { useVaultTree } from "../features/vault/hooks/useVaultTree";
import type { BootResult, FlatTreeNode } from "../features/vault/types";

// ---------------------------------------------------------------------------
// Route — loader fetches boot (includes pre-built tree) in one round-trip
// ---------------------------------------------------------------------------

interface LoaderData {
  boot: BootResult;
}

export const Route = createFileRoute("/")({
  loader: async (): Promise<LoaderData> => {
    const boot = await invoke<BootResult>("boot");
    return { boot };
  },

  pendingComponent: () => (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-[var(--sat-text-muted)]">
      <div className="w-5 h-5 border-2 border-[var(--sat-text-muted)] border-t-[var(--sat-accent-primary)] rounded-full animate-spin" />
      <span className="text-sm text-[var(--sat-text-primary)]">
        Loading vault…
      </span>
    </div>
  ),

  component: RouteComponent,
});

// ---------------------------------------------------------------------------
// Route component — thin composition layer only, no business logic here
// ---------------------------------------------------------------------------

function RouteComponent() {
  const { boot } = Route.useLoaderData();

  const vaultPath = boot.vault_path;

  // ── Feature hooks ─────────────────────────────────────────────────────────

  const { visibleNodes, openFolders, toggleFolder, setTreeNodes } =
    useVaultTree(boot.tree);

  const vaultActions = useVaultActions();

  // When the loader re-runs (after vault change / reindex) sync the tree.
  useEffect(() => {
    setTreeNodes(boot.tree);
  }, [boot.tree, setTreeNodes]);

  const findNote = useCallback(
    (name: string): FlatTreeNode | undefined =>
      visibleNodes.find(
        (n) =>
          n.kind === "file" && (n.name === name || n.name === `${name}.md`),
      ),
    [visibleNodes],
  );

  const editor = useEditor({ findNote });

  // Merge status messages: vault actions take priority over editor status.
  const statusMessage = vaultActions.status ?? editor.status;

  // ── No-vault splash ───────────────────────────────────────────────────────

  if (!vaultPath) {
    return (
      <VaultSplash
        isIndexing={vaultActions.isIndexing}
        status={vaultActions.status}
        onOpenVault={vaultActions.pickAndSetVault}
      />
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Top toolbar */}
      <Toolbar
        vaultPath={vaultPath}
        isIndexing={vaultActions.isIndexing}
        status={statusMessage}
        onChangeVault={vaultActions.pickAndSetVault}
        onReindex={vaultActions.reindexVault}
      />

      {/* Three-column body */}
      <div className="flex flex-1 min-h-0 gap-3 p-3">
        {/* ── Left sidebar: file tree ── */}
        <div className="w-56 shrink-0 flex flex-col min-h-0">
          <FileTree
            visibleNodes={visibleNodes}
            openFolders={openFolders}
            selectedPath={editor.selected?.path ?? null}
            onFileClick={(node: FlatTreeNode) =>
              editor.loadNote({ name: node.name, path: node.path })
            }
            onFolderToggle={toggleFolder}
          />
        </div>

        {/* ── Centre: editor ── */}
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)] rounded-lg overflow-hidden">
          {/* Editor header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--sat-layout-border)] shrink-0">
            <span className="text-sm text-[var(--sat-text-primary)] flex-1 truncate">
              {editor.selected ? editor.selected.name : "No note selected"}
            </span>
            <SaveIndicator status={editor.saveStatus} />
          </div>

          {/* Conflict banner */}
          {editor.saveStatus === "conflict" && (
            <ConflictBanner
              onKeepMine={editor.performSave}
              onDiscard={editor.discardAndReload}
            />
          )}

          {/* Editor */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <Editor
              className="h-full"
              value={editor.content}
              onChange={editor.handleChange}
              initialContent=""
              onFetchLinks={editor.onFetchLinks}
              onFetchTags={editor.onFetchTags}
              onOpenLink={editor.handleOpenLink}
              onSearch={(query) => {
                console.log("Searching for:", query);
                // Future integration: trigger global search modal
              }}
            />
          </div>
        </div>

        {/* ── Right sidebar: backlinks ── */}
        {/*<div className="w-52 shrink-0 flex flex-col min-h-0">
          <BacklinksSidebar
            backlinks={editor.backlinks}
            onOpenNote={(note: LinkSuggestion) => editor.loadNote(note)}
          />
        </div>*/}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conflict banner — extracted to keep RouteComponent readable
// ---------------------------------------------------------------------------

interface ConflictBannerProps {
  onKeepMine: () => void;
  onDiscard: () => void;
}

function ConflictBanner({ onKeepMine, onDiscard }: ConflictBannerProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[color-mix(in srgb,var(--sat-state-danger) 18%,transparent)] border-b border-[var(--sat-state-danger)] text-sm text-[var(--sat-text-primary)] shrink-0">
      <span className="flex-1 text-xs leading-snug">
        File changed externally. Keep your edits or discard them?
      </span>
      <button
        type="button"
        onClick={onKeepMine}
        className="px-2.5 py-1 rounded bg-[var(--sat-state-danger)] hover:opacity-90 text-[var(--sat-text-inverse)] text-xs font-semibold transition-colors"
      >
        Keep mine
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="px-2.5 py-1 rounded bg-[var(--sat-surface-2)] hover:bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)] text-xs font-semibold transition-colors"
      >
        Discard
      </button>
    </div>
  );
}
