// ---------------------------------------------------------------------------
// useKeyboardShortcuts — single keydown listener for global app shortcuts.
// Every phase of the app registers its shortcuts here instead of sprinkling
// window.addEventListener("keydown", ...) across components.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

export interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  /** If true, calls e.preventDefault() before handler. */
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(
  shortcuts: Record<string, ShortcutDef>,
  deps: unknown[] = [],
) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      for (const def of Object.values(shortcuts)) {
        const matchKey = e.key.toLowerCase() === def.key.toLowerCase();
        const matchCtrl = def.ctrl ? e.ctrlKey : !e.ctrlKey;
        const matchMeta = def.meta ? e.metaKey : !e.metaKey;
        const matchShift = def.shift ? e.shiftKey : !e.shiftKey;
        const matchAlt = def.alt ? e.altKey : !e.altKey;

        if (matchKey && matchCtrl && matchMeta && matchShift && matchAlt) {
          if (def.preventDefault) e.preventDefault();
          def.handler();
          return; // first match wins
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
