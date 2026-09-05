/**
 * tabCommands — Cross-feature command registrations (tabs + editor).
 *
 * Architecture: This file registers tab-related commands. It imports from
 * BOTH `features/tabs` and `features/editor`, so it lives in `shared/` —
 * not inside either feature. Features must never import from each other
 * directly. Active-tab resolution is delegated to `shared/activeEditor.ts`
 * (the single cross-feature authority).
 *
 * These commands are registered as a side effect when this module is
 * imported. The import is triggered from `app-shell/` (the composition
 * root), not from within any feature. Registration happens ONCE; handlers
 * resolve the active tab at execution time.
 */
import { commandService } from "@workspace/commands";
import { useTabsStore } from "../features/tabs";
import { resolveActiveTab } from "./activeEditor";

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
