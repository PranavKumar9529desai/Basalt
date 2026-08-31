/**
 * Parsed representation of a hotkey string like "CmdOrCtrl+F".
 *
 * Supports these modifiers (case-insensitive, combined with `+`):
 * - `CmdOrCtrl` — Meta on macOS, Ctrl on Windows/Linux
 * - `Cmd` / `Meta` — Meta key only
 * - `Ctrl` — Control key only
 * - `Shift`
 * - `Alt`
 *
 * The key portion matches `KeyboardEvent.key` (lowercased).
 */
export interface ParsedHotkey {
  key: string;
  cmdOrCtrl: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * Parse a hotkey string into a matcher.
 *
 * @example
 * parseHotkey("CmdOrCtrl+F")  // matches Ctrl+F on Windows, Cmd+F on macOS
 * parseHotkey("CmdOrCtrl+Shift+P") // matches Ctrl+Shift+P or Cmd+Shift+P
 */
export function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey.split("+").map((p) => p.trim().toLowerCase());
  let key = "";
  let cmdOrCtrl = false;
  let shift = false;
  let alt = false;

  for (const part of parts) {
    if (part === "cmdorctrl" || part === "mod") {
      cmdOrCtrl = true;
    } else if (part === "cmd" || part === "meta") {
      cmdOrCtrl = true;
    } else if (part === "ctrl") {
      cmdOrCtrl = true;
    } else if (part === "shift") {
      shift = true;
    } else if (part === "alt") {
      alt = true;
    } else {
      key = part;
    }
  }

  return { key, cmdOrCtrl, shift, alt };
}
