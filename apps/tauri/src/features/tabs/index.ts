export { useTabsStore } from "./store";
export { useTabs } from "./hooks/useTabs";
export { useTabPersistence } from "./hooks/useTabPersistence";
export { useTabIO } from "./hooks/useTabIO";
export { useTabDnD } from "./hooks/useTabDnD";
export { WorkspaceTabs } from "./components/WorkspaceTabs";
export type { PaneRenderContext } from "./components/WorkspaceTabs";

export type {
  OpenableTabInput,
  SplitDirection,
  TabClickOpenBehavior,
  TabGroupId,
  TabGroupModel,
  TabId,
  TabModel,
  TabsWorkspaceSnapshot,
} from "./types";
export type {
  CloseTabOptions,
  MoveTabOptions,
  OpenTabOptions,
  TabsState,
} from "./store";
export type {
  CachedTabContent,
  OpenFileResult,
  SaveFileInput,
  UseTabIOOptions,
} from "./hooks/useTabIO";
