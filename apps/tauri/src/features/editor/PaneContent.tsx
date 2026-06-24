import { useCallback, useEffect, useRef } from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { Editor } from "./components/editor-context-menu";
import { useEditor } from "./hooks/useEditor";
import type { FlatTreeNode } from "../vault/types";
import type { TabGroupId, TabModel } from "../tabs/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaneContentProps {
  groupId: TabGroupId;
  activeTab: TabModel | null;
  isFocused: boolean;
  findNote: (name: string) => FlatTreeNode | undefined;
  markTabDirty: (tabId: string, dirty: boolean) => void;
  onActivateGroup: () => void;
}

// ---------------------------------------------------------------------------
// Conflict banner
// ---------------------------------------------------------------------------

function ConflictBanner({
  onKeepMine,
  onDiscard,
}: {
  onKeepMine: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[color-mix(in srgb,var(--sat-state-danger) 18%,transparent)] border-b border-[var(--sat-state-danger)] text-sm text-[var(--sat-text-primary)] shrink-0">
      <span className="flex-1 text-xs leading-snug">
        File changed externally. Keep your edits or discard them?
      </span>
      <Button
        type="button"
        size="xs"
        onClick={onKeepMine}
        className="bg-[var(--sat-state-danger)] text-[var(--sat-text-inverse)] hover:opacity-90 border-transparent"
      >
        Keep mine
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={onDiscard}
        className="bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)] hover:bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)]"
      >
        Discard
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inactive pane placeholder
// ---------------------------------------------------------------------------

function InactiveGroupPane({
  activeTitle,
  onActivate,
}: {
  activeTitle: string | null;
  onActivate: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--sat-surface-2)] px-6 text-center">
      <Button
        type="button"
        onClick={onActivate}
        variant="outline"
        className="border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)] text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-3)]"
      >
        {activeTitle
          ? `Activate pane to edit: ${activeTitle}`
          : "Activate pane to edit"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save indicator
// ---------------------------------------------------------------------------

function SaveIndicator({ status }: { status: string }) {
  const CONFIG: Record<string, { dot: string; label: string }> = {
    saved: { dot: "bg-[var(--sat-state-success)]", label: "Saved" },
    saving: {
      dot: "bg-[var(--sat-state-warning)] animate-pulse",
      label: "Saving…",
    },
    unsaved: { dot: "bg-[var(--sat-text-muted)]", label: "Unsaved" },
    conflict: {
      dot: "bg-[var(--sat-state-danger)] animate-pulse",
      label: "Conflict",
    },
  };

  const { dot, label } = CONFIG[status] ?? CONFIG.saved;

  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--sat-text-muted)] select-none">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaneContent — single editor pane
// ---------------------------------------------------------------------------

export function PaneContent({
  groupId,
  activeTab,
  isFocused,
  findNote,
  markTabDirty,
  onActivateGroup,
}: PaneContentProps) {
  const editor = useEditor({ findNote });
  const lastLoadedPathRef = useRef<string | null>(null);

  // Load note when active tab changes
  useEffect(() => {
    if (!activeTab) {
      lastLoadedPathRef.current = null;
      editor.closeNote();
      return;
    }

    const path = activeTab.path;
    if (lastLoadedPathRef.current === path) {
      return;
    }
    lastLoadedPathRef.current = path;
    void editor.loadNote({ name: activeTab.title, path });
  }, [activeTab?.path, activeTab?.title, editor.closeNote, editor.loadNote]);

  const handleEditorChange = useCallback(
    (value: string) => {
      if (activeTab) {
        markTabDirty(activeTab.id, true);
      }
      editor.handleChange(value);
    },
    [activeTab, markTabDirty, editor.handleChange],
  );

  const handlePanePointerDown = useCallback(() => {
    onActivateGroup();
  }, [onActivateGroup]);

  if (!isFocused) {
    return (
      <InactiveGroupPane
        activeTitle={activeTab?.title ?? null}
        onActivate={onActivateGroup}
      />
    );
  }

  if (!activeTab) {
    return null;
  }

  return (
    <>
      {editor.saveStatus === "conflict" && (
        <ConflictBanner
          onKeepMine={editor.performSave}
          onDiscard={editor.discardAndReload}
        />
      )}
      <div
        className="flex flex-1 min-h-0"
        onPointerDownCapture={handlePanePointerDown}
      >
        <div className="flex flex-1 flex-col overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--sat-layout-divider)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--sat-layout-divider)_70%,transparent)] hover:[&::-webkit-scrollbar-thumb]:bg-[var(--sat-layout-divider)]">
          <Editor
            className="flex-1 min-h-0"
            value={editor.content}
            onChange={handleEditorChange}
            initialContent=""
            onFetchLinks={editor.onFetchLinks}
            onFetchTags={editor.onFetchTags}
            onOpenLink={editor.handleOpenLink}
            onSearch={(query) => {
              console.log("Searching for:", query);
            }}
          />
        </div>
      </div>
    </>
  );
}
