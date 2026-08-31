/**
 * Ephemeral status line under the editor (I/O feedback like save errors,
 * open errors, external-change notices). Rendered from `io.status` — plain
 * text, no logic.
 */
export function StatusLine({ status }: { status: string }) {
  return (
    <div className="px-3 py-1 text-xs text-[var(--sat-text-muted)] shrink-0">
      {status}
    </div>
  );
}