import { useTabDnD } from "../hooks/useTabDnD";
import { useTabsStore } from "../store";

/** Floating tab pill that follows the pointer while a tab drag is in flight.
 * Universal for all platforms (incl. WebKitGTK, which has no native HTML5
 * drag ghost — see useTabDnD#handleTabPointerDown). */
export function TabDragGhost() {
  const dragState = useTabDnD().dragState;
  const title = useTabsStore((s) =>
    dragState ? s.tabs[dragState.tabId]?.title : undefined,
  );
  if (!dragState?.cursor) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[100]"
      style={{ left: dragState.cursor.x + 12, top: dragState.cursor.y + 14 }}
    >
      <div className="flex h-9 items-center gap-2 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2 shadow-xl">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-[var(--sat-accent-primary)]"
        />
        <span className="max-w-[220px] truncate text-xs text-[var(--sat-text-primary)]">
          {title ?? dragState.tabId}
        </span>
      </div>
    </div>
  );
}
