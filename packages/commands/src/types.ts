import type React from "react";

export interface CommandMetadata {
  id: string;
  name: string;
  category?: string;
  icon?: string;
}

export interface Command extends Omit<CommandMetadata, "icon"> {
  icon?: React.ReactNode;
  callback: () => void | Promise<void>;
  checkCallback?: () => boolean;
}
