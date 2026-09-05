/**
 * tabCommands — Cross-feature command registrations (tabs + editor).
 *
 * Architecture: This file registers tab-related commands that depend on
 * editor state (the focused pane). It imports from BOTH `features/tabs`
 * and `features/editor`, so it lives in `shared/` — not inside either
 * feature. Features must never import from each other directly.
 *
 * These commands are registered as a side effect when this module is
 * imported. The import is triggered from `app-shell/` (the composition
 * root), not from within any feature.
 */
import { commandService } from "@workspace/commands";
import { useActiveNoteStore } from "../features/editor";
import { findLeaf, getTabByPath, useTabsStore } from "../features/tabs";

function resolveActiveTab() {
  const selected = useActiveNoteStore.getState().activeNote;
  if (!selected?.path) return null;
  const { root, activePaneId, tabs } = useTabsStore.getState();
  const leaf = findLeaf(root, activePaneId);
  if (!leaf) return null;
  const tab = getTabByPath(leaf.tabGroup.tabIds, tabs, selected.path);
  return tab;
}

commandService.registerCommand(
  "tabs:close-active",
  () => {
    const tab = resolveActiveTab();
    if (tab) {
      useTabsStore.getState().closeTab(tab.id, { force: true });
    }
  },
  () => resolveActiveTab() !== null,
);

commandService.registerCommand(
  "tabs:close-others",
  () => {
    const tab = resolveActiveTab();
    if (tab) {
      useTabsStore.getState().closeOtherTabs(tab.id);
    }
  },
  () => resolveActiveTab() !== null,
);

commandService.registerCommand(
  "tabs:close-right",
  () => {
    const tab = resolveActiveTab();
    if (tab) {
      useTabsStore.getState().closeTabsToRight(tab.id);
    }
  },
  () => resolveActiveTab() !== null,
);

commandService.registerCommand(
  "tabs:toggle-pin",
  () => {
    const tab = resolveActiveTab();
    if (tab) {
      useTabsStore.getState().togglePinTab(tab.id);
    }
  },
  () => resolveActiveTab() !== null,
);

commandService.registerCommand("graph:open", () => {
  useTabsStore.getState().openView("graph", { title: "Graph" });
});

commandService.registerCommand(
  "editor:toggle-view-mode",
  () => {
    const tab = resolveActiveTab();
    if (!tab || tab.leafType !== "markdown") {
      return;
    }
    const nextMode = tab.viewMode === "reading" ? "edit" : "reading";
    useTabsStore.getState().setTabViewMode(tab.id, nextMode);
  },
  () => resolveActiveTab()?.leafType === "markdown",
);

commandService.registerCommand("pane:split-right", () => {
  useTabsStore.getState().splitActivePane("vertical");
});

commandService.registerCommand("pane:split-down", () => {
  useTabsStore.getState().splitActivePane("horizontal");
});

commandService.registerCommand("pane:close", () => {
  const { activePaneId } = useTabsStore.getState();
  useTabsStore.getState().closePane(activePaneId);
});
