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
  /** External drop affordance driven by the pointer-drag path (e.g. an
   * accent slot shown on the hovered edge of a tab pill). Overrides the
   * internal HTML5-drop indicator while the pointer drag is active. */
  dropEdge?: "left" | "right";
}
