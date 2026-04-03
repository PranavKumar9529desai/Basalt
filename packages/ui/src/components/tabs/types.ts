import type { ReactNode } from "react";

export interface TabItemData {
  id: string;
  title: string;
  icon?: ReactNode;
  isActive?: boolean;
  isDirty?: boolean;
  isPinned?: boolean;
  isPreview?: boolean;
  canClose?: boolean;
  disabled?: boolean;
}
