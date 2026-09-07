import {
  IconBook,
  IconCalendarEvent,
  IconFilePlus,
  IconFolderOpen,
  IconGauge,
  IconFileSearch,
  IconLayoutBoardSplit,
  IconLayoutNavbar,
  IconLayoutSidebarRight,
  IconPinned,
  IconPlus,
  IconPrinter,
  IconRectangleVertical,
  IconSearch,
  IconSettings,
  IconSitemap,
  IconTemplate,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
const ICONS: Record<string, ComponentType<{ size?: number }>> = {
  IconBook,
  IconCalendarEvent,
  IconFilePlus,
  IconFolderOpen,
  IconGauge,
  IconFileSearch,
  IconLayoutBoardSplit,
  IconLayoutNavbar,
  IconLayoutSidebarRight,
  IconPinned,
  IconPlus,
  IconPrinter,
  IconRectangleVertical,
  IconSearch,
  IconSettings,
  IconSitemap,
  IconTemplate,
  IconTrash,
  IconX,
};

export function resolveIcon(
  name: string | undefined,
): ComponentType<{ size?: number }> | undefined {
  return name ? ICONS[name] : undefined;
}
