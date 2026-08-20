/**
 * paneCommands — Cross-feature command registrations (tabs + editor).
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
import { useFocusedPaneStore } from "../features/editor";
import { findGroupForTab, getTabByPath } from "../features/tabs/selectors";
import { useTabsStore } from "../features/tabs/store";

function resolveTabAndGroup() {
  const selected = useFocusedPaneStore.getState().focusedPaneSelected;
  if (!selected?.path) return null;
  const { tabs, groups } = useTabsStore.getState();
  const tab = getTabByPath(groups, tabs, selected.path);
  if (!tab) return null;
  const groupId = findGroupForTab(groups, tab.id);
  if (!groupId) return null;
  return { tab, groupId, groups };
}

commandService.registerCommand("tabs:close-active", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().closeTab(resolved.groupId, resolved.tab.id, { force: true });
  }
}, () => resolveTabAndGroup() !== null);

commandService.registerCommand("tabs:close-others", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().closeOtherTabs(resolved.groupId, resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

commandService.registerCommand("tabs:close-right", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().closeTabsToRight(resolved.groupId, resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

commandService.registerCommand("tabs:toggle-pin", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().togglePinTab(resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

commandService.registerCommand("tabs:split-right", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().splitGroupWithTab(resolved.groupId, "right", resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

commandService.registerCommand("tabs:split-left", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().splitGroupWithTab(resolved.groupId, "left", resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

commandService.registerCommand("tabs:split-up", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().splitGroupWithTab(resolved.groupId, "top", resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

commandService.registerCommand("tabs:split-down", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().splitGroupWithTab(resolved.groupId, "bottom", resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);
