/**
 * activeEditor — the cross-feature "which editor is active" authority.
 *
 * VS Code model, adapted: commands, keybinding actions, and context
 * derivation never capture a per-pane editor at registration time. They
 * resolve the ACTIVE editor here, at execution time, from two sources of
 * truth that already exist:
 *   - `tabsStore.activePaneId` — the focused pane (set by LeafPane focus)
 *   - `editorControllerRegistry` — paneId → EditorController (set on mount)
 *
 * This file sits in shared/ because it wires features/editor + features/tabs
 * together; neither feature may import the other.
 */
import { keybindingService } from "@workspace/keybindings";
import {
  editorControllerRegistry,
  useActiveNoteStore,
  type EditorController,
} from "../features/editor";
import { findLeaf, getTabByPath, useTabsStore, type TabModel } from "../features/tabs";

/** The controller of the currently active pane, or null when it isn't an
 *  editor pane (or isn't mounted yet). */
export function resolveActiveController(): EditorController | null {
  const { activePaneId } = useTabsStore.getState();
  if (!activePaneId) return null;
  return editorControllerRegistry.get(activePaneId) ?? null;
}

/** The active pane's active tab, or null when there's no open note. */
export function resolveActiveTab(): TabModel | null {
  const selected = useActiveNoteStore.getState().activeNote;
  if (!selected?.path) return null;
  const { root, activePaneId, tabs } = useTabsStore.getState();
  const leaf = findLeaf(root, activePaneId);
  if (!leaf) return null;
  return getTabByPath(leaf.tabGroup.tabIds, tabs, selected.path);
}

/**
 * Derives keybinding contexts from the active-editor authority. ONE owner
 * writes the context flags — mount/unmount writes from per-pane hooks were
 * owner-unsafe (closing pane B would clear the flag while pane A was live).
 *
 * Subscribes to both the controller registry (pane mounts/disappear) and the
 * tabs store's `activePaneId` (focus moves between panes). Returns the
 * unsubscribe — call once from the shell.
 */
export function startEditorContextSync(): () => void {
  const sync = () => {
    keybindingService.updateContext({
      editorFocused: resolveActiveController() !== null,
    });
  };

  const unsubRegistry = editorControllerRegistry.subscribe(sync);

  let lastPaneId = useTabsStore.getState().activePaneId;
  const unsubTabs = useTabsStore.subscribe((state) => {
    if (state.activePaneId !== lastPaneId) {
      lastPaneId = state.activePaneId;
      sync();
    }
  });

  sync();

  return () => {
    unsubRegistry();
    unsubTabs();
  };
}