export interface Keybinding {
  /** Key combination, e.g. "CmdOrCtrl+F", "Ctrl+S", "Escape" */
  key: string;
  /** Optional: command id to execute. If omitted, action is required. */
  command?: string;
  /** Optional: pure action name to run. Used for non-command keybindings. */
  action?: string;
  /** Optional: when clause. If omitted, always active. */
  when?: string;
}

export type ContextValue = boolean | string | number;

export type WhenContext = Record<string, ContextValue>;
