import {
  IconFilePlus,
  IconFileSearch,
  IconLayoutBoardSplit,
  IconPinned,
  IconPlus,
  IconRectangleVertical,
  IconSearch,
  IconSettings,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

const ICONS: Record<string, ComponentType<{ size?: number }>> = {
  IconFilePlus,
  IconFileSearch,
  IconLayoutBoardSplit,
  IconPinned,
  IconPlus,
  IconRectangleVertical,
  IconSearch,
  IconSettings,
  IconTrash,
  IconX,
};

export function resolveIcon(name: string | undefined): ComponentType<{ size?: number }> | undefined {
  return name ? ICONS[name] : undefined;
}
