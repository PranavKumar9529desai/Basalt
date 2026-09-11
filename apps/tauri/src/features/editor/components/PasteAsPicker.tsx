import { useEffect, useMemo, useState } from "react";
import {
  ContextMenu as MenuRoot,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/ui/context-menu";
import type { PasteRichChoice } from "@workspace/editor";
import {
  choosePasteAs,
  dismissPasteAsPicker,
  getPendingPasteAs,
  subscribePasteAsPicker,
} from "../lib/pasteAsPicker";

/** Managed ContextMenu anchored at the paste point.  Rendered once globally
 *  (Overlays.tsx) — the module store ensures only one pane is active at a time. */
export function PasteAsPicker() {
  const [, rerender] = useState(0);

  useEffect(() => {
    return subscribePasteAsPicker(() => rerender((c) => c + 1));
  }, []);

  const pending = getPendingPasteAs();
  const anchor = useMemo(() => {
    if (!pending) return null;
    const { x, y } = pending.request.anchor;
    return { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
  }, [pending]);

  if (!pending || !anchor) return null;

  const { options, defaultId } = pending.request;

  return (
    <MenuRoot
      open
      onOpenChange={(open) => {
        if (!open) dismissPasteAsPicker();
      }}
    >
      <ContextMenuContent anchor={anchor} className="min-w-[200px]">
        {options.map((opt) => (
          <ContextMenuItem
            key={opt.id}
            onClick={() => choosePasteAs(opt.id as PasteRichChoice)}
          >
            {opt.label}
            {opt.id === defaultId && (
              <span className="ml-auto text-[var(--sat-text-secondary)]">
                default
              </span>
            )}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={dismissPasteAsPicker}>
          Revert to default paste
        </ContextMenuItem>
      </ContextMenuContent>
    </MenuRoot>
  );
}
