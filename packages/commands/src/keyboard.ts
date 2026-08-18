import { useEffect } from "react";
import { useCommandStore } from "./store";

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
interface ParsedHotkey {
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

function matchesHotkey(e: KeyboardEvent, parsed: ParsedHotkey): boolean {
  const keyMatch = e.key.toLowerCase() === parsed.key;
  const modMatch = parsed.cmdOrCtrl
    ? e.ctrlKey || e.metaKey
    : !e.ctrlKey && !e.metaKey;
  const shiftMatch = parsed.shift ? e.shiftKey : !e.shiftKey;
  const altMatch = parsed.alt ? e.altKey : !e.altKey;
  return keyMatch && modMatch && shiftMatch && altMatch;
}

/**
 * Global hotkey handler — reads hotkeys from the command store and
 * dispatches to the matching command's callback.
 *
 * Mount this once at the root of the app. It subscribes to the command
 * store and re-evaluates on every keydown.
 *
 * @example
 * // In __root.tsx
 * <HotkeyHandler />
 */
export function HotkeyHandler() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { commands, execute } = useCommandStore.getState();

      for (const cmd of Object.values(commands)) {
        if (!cmd.hotkeys?.length) continue;
        if (cmd.checkCallback && !cmd.checkCallback()) continue;

        for (const hotkey of cmd.hotkeys) {
          if (matchesHotkey(e, parseHotkey(hotkey))) {
            e.preventDefault();
            execute(cmd.id);
            return;
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
