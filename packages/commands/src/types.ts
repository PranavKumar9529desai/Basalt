import type React from "react";

/**
 * Static metadata for a command, defined in `commands.json`.
 * Icons are stored as string references (e.g., "IconSearch") and resolved
 * to React components at registration time via the icon resolver.
 */
export interface CommandMetadata {
  id: string;
  name: string;
  category?: string;
  hotkeys?: string[];
  icon?: string;
}

/**
 * A fully registered command: metadata merged with a runtime callback.
 * The store resolves `icon` from a string to a React component.
 */
export interface Command extends Omit<CommandMetadata, "icon"> {
  icon?: React.ReactNode;
  callback: () => void | Promise<void>;
  checkCallback?: () => boolean;
}
