export type { PaneRenderContext } from "./components/Tabs";
export { Tabs } from "./components/Tabs";
export { TabsBar } from "./components/TabsBar";
export { useTabDnD } from "./hooks/useTabDnD";
export { useTabPersistence } from "./hooks/useTabPersistence";
export { getTabByPath } from "./selectors";
export type { CloseTabOptions, OpenTabOptions, TabsState } from "./store";
export { useTabsStore } from "./store";
export type {
  OpenableTabInput,
  TabPaneId,
  TabPane,
  TabId,
  TabModel,
  NoteViewMode,
  TabsWorkspaceSnapshot,
} from "./types";
