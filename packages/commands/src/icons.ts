import {
  IconFilePlus,
  IconFolderOpen,
  IconGauge,
  IconFileSearch,
  IconLayoutBoardSplit,
  IconPinned,
  IconPlus,
  IconRectangleVertical,
  IconSearch,
  IconSettings,
  IconTrash,
  IconX,
  IconSitemap,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

const ICONS: Record<string, ComponentType<{ size?: number }>> = {
  IconFilePlus,
  IconFolderOpen,
  IconGauge,
  IconFileSearch,
  IconLayoutBoardSplit,
  IconPinned,
  IconPlus,
  IconRectangleVertical,
  IconSearch,
  IconSettings,
  IconTrash,
  IconX,
  IconSitemap,
};

export function resolveIcon(
  name: string | undefined,
): ComponentType<{ size?: number }> | undefined {
  return name ? ICONS[name] : undefined;
}
