import type { TabGroupId, TabGroupModel, TabId, TabModel } from "../types";
import { ROOT_GROUP_ID } from "../constants";
import { createGroupNode } from "./layout";

export function nowMs() {
  return Date.now();
}

export function makeGroupId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `group-${crypto.randomUUID()}`;
  }
  return `group-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeTabId(path: string) {
  return `tab:${path}`;
}

export function titleFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const file = normalized.split("/").pop() ?? path;
  return file.endsWith(".md") ? file.slice(0, -3) : file;
}

export function getOrCreateGroup(
  groups: Record<TabGroupId, TabGroupModel>,
  groupId: TabGroupId,
) {
  if (groups[groupId]) return groups[groupId];
  const fallback: TabGroupModel = {
    id: groupId,
    tabIds: [],
    activeTabId: null,
    previewTabId: null,
  };
  groups[groupId] = fallback;
  return fallback;
}

export function findGroupForTab(
  groups: Record<TabGroupId, TabGroupModel>,
  tabId: TabId,
): TabGroupId | null {
  for (const [groupId, group] of Object.entries(groups)) {
    if (group.tabIds.includes(tabId)) return groupId;
  }
  return null;
}

export function removeTabFromGroup(group: TabGroupModel, tabId: TabId) {
  group.tabIds = group.tabIds.filter((id) => id !== tabId);

  if (group.previewTabId === tabId) {
    group.previewTabId = null;
  }

  if (group.activeTabId === tabId) {
    const next =
      group.tabIds.length > 0 ? group.tabIds[group.tabIds.length - 1] : null;
    group.activeTabId = next;
  }
}

export function ensureAtLeastOneGroup(
  groups: Record<TabGroupId, TabGroupModel>,
  groupOrder: TabGroupId[],
  focusedGroupId: TabGroupId | null,
) {
  if (groupOrder.length > 0 && focusedGroupId && groups[focusedGroupId]) {
    return { groups, groupOrder, focusedGroupId };
  }

  const fallbackId = groupOrder[0] ?? ROOT_GROUP_ID;
  const nextGroups = { ...groups };
  const nextOrder = groupOrder.length > 0 ? [...groupOrder] : [fallbackId];

  if (!nextGroups[fallbackId]) {
    nextGroups[fallbackId] = {
      id: fallbackId,
      tabIds: [],
      activeTabId: null,
      previewTabId: null,
    };
  }

  return {
    groups: nextGroups,
    groupOrder: nextOrder,
    focusedGroupId: fallbackId,
  };
}

export function buildInitialState() {
  return {
    tabs: {} as Record<TabId, TabModel>,
    groups: {
      [ROOT_GROUP_ID]: {
        id: ROOT_GROUP_ID,
        tabIds: [],
        activeTabId: null,
        previewTabId: null,
      },
    } as Record<TabGroupId, TabGroupModel>,
    groupOrder: [ROOT_GROUP_ID] as TabGroupId[],
    focusedGroupId: ROOT_GROUP_ID as TabGroupId,
    layoutRoot: createGroupNode(ROOT_GROUP_ID),
  };
}
