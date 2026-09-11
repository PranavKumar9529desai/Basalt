import type {
  AmbiguousPasteRequest,
  AmbiguousPasteResolver,
  PasteRichChoice,
} from "@workspace/editor";

// Paste-As chooser state (VS Code PostEditWidget). Owned by the editor
// feature: the CM6 paste extension emits an ambiguous-paste request, the
// controller records it here, and the app-shell-rendered <PasteAsPicker/>
// resolves it. A plain module store + subscriber set — this is an event,
// not feature state that warrants a zustand store.

export interface PendingPasteAs {
  request: AmbiguousPasteRequest;
  resolve: AmbiguousPasteResolver;
}

let current: PendingPasteAs | null = null;
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

/** Record the pending ambiguous paste. `resolve(null)` keeps the default;
 *  any PasteRichChoice swaps the just-inserted text for that flavor. */
export function showPasteAsPicker(
  request: AmbiguousPasteRequest,
  resolve: AmbiguousPasteResolver,
) {
  current = { request, resolve };
  publish();
}

/** Nothing pending — safe no-op. */
export function getPendingPasteAs(): PendingPasteAs | null {
  return current;
}

/** Close without picking — the inserted default text stays. */
export function dismissPasteAsPicker() {
  if (!current) return;
  const { resolve } = current;
  current = null;
  publish();
  resolve(null);
}

/** Pick a flavor: swap the inserted text to that alternative. */
export function choosePasteAs(choice: PasteRichChoice) {
  if (!current) return;
  const { resolve } = current;
  current = null;
  publish();
  resolve(choice);
}

export function subscribePasteAsPicker(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
