import type React from "react";

/**
 * A single command that can be registered in the global command palette.
 * Commands are registered by features and displayed in the CommandPalette UI.
 */
export interface Command {
  id: string;
  name: string;
  description?: string;
  icon?: React.ReactNode;
  category?: string;
  hotkeys?: string[];
  callback: () => void | Promise<void>;
  checkCallback?: () => boolean;
}
