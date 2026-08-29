export type { PaneRenderContext } from "./components/WorkspaceTabs";
export { WorkspaceTabs } from "./components/WorkspaceTabs";
export { WorkspaceTabsBar } from "./components/WorkspaceTabsBar";
export { useTabDnD } from "./hooks/useTabDnD";
export { useTabPersistence } from "./hooks/useTabPersistence";
export { useTabs } from "./hooks/useTabs";
export { getTabByPath } from "./selectors";
export type { CloseTabOptions, OpenTabOptions, TabsState } from "./store";
export { useTabsStore } from "./store";
export type {
  OpenableTabInput,
  TabPaneId,
  TabPane,
  TabId,
  TabModel,
  TabsWorkspaceSnapshot,
} from "./types";
