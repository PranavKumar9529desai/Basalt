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
import { getTabByPath } from "../features/tabs/selectors";
import { useTabsStore } from "../features/tabs/store";

function resolveActiveTab() {
  const selected = useActiveNoteStore.getState().activeNote;
  if (!selected?.path) return null;
  const { tabs, pane } = useTabsStore.getState();
  const tab = getTabByPath(pane, tabs, selected.path);
  if (!tab) return null;
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
