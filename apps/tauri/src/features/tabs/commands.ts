import { useCommandStore } from "@workspace/commands";
import { useFocusedPaneStore } from "../editor";
import { findGroupForTab, getTabByPath } from "./selectors";
import { useTabsStore } from "./store";

const { registerCommand } = useCommandStore.getState();

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

registerCommand("tabs:close-active", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().closeTab(resolved.groupId, resolved.tab.id, { force: true });
  }
}, () => resolveTabAndGroup() !== null);

registerCommand("tabs:close-others", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().closeOtherTabs(resolved.groupId, resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

registerCommand("tabs:close-right", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().closeTabsToRight(resolved.groupId, resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

registerCommand("tabs:toggle-pin", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().togglePinTab(resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

registerCommand("tabs:split-right", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().splitGroupWithTab(resolved.groupId, "right", resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

registerCommand("tabs:split-left", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().splitGroupWithTab(resolved.groupId, "left", resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

registerCommand("tabs:split-up", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().splitGroupWithTab(resolved.groupId, "top", resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);

registerCommand("tabs:split-down", () => {
  const resolved = resolveTabAndGroup();
  if (resolved) {
    useTabsStore.getState().splitGroupWithTab(resolved.groupId, "bottom", resolved.tab.id);
  }
}, () => resolveTabAndGroup() !== null);
