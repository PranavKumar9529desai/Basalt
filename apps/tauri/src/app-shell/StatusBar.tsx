import { useActiveNoteStore } from "../features/editor";

export function StatusBar() {
  const note = useActiveNoteStore((s) => s.activeNote);
  const chars = useActiveNoteStore((s) => s.chars);
  const words = useActiveNoteStore((s) => s.words);

  return (
    <div className="h-6 shrink-0 bg-[var(--sat-surface-2)] border-t border-[var(--sat-layout-border)] flex items-center gap-4 px-3 text-xs text-[var(--sat-text-muted)]">
      <span className="flex-1 truncate">
        {note ? note.name : "No note open"}
      </span>
      <span className="hidden md:inline">Source mode</span>
      <span className="tabular-nums">{words} words</span>
      <span className="tabular-nums">{chars} chars</span>
    </div>
  );
}
