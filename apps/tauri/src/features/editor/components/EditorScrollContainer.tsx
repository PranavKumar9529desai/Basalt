import type { ReactNode } from "react";

/**
 * Thin-scroll wrapper around the editor that owns the editor's scrollbar
 * theming (thin, sat-divider colored) and the flex layout. Kept as its own
 * element so the CM view always renders inside a `min-h-0` flex child —
 * without it the editor's auto-expanding content would blow the grid.
 */
export function EditorScrollContainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--sat-layout-divider)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--sat-layout-divider)_70%,transparent)] hover:[&::-webkit-scrollbar-thumb]:bg-[var(--sat-layout-divider)]">
        {children}
      </div>
    </div>
  );
}
