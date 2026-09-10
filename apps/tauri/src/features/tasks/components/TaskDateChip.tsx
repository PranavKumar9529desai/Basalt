/**
 * TaskDateChip — subtle inline date tag for task surfaces.
 * Presentational: props in, DOM out. Uses --sat-* theme tokens only.
 */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const thisYear = new Date().getFullYear();
  const year = d.getFullYear();
  return year === thisYear
    ? `${months[d.getMonth()]} ${d.getDate()}`
    : `${months[d.getMonth()]} ${d.getDate()}, ${year}`;
}

export interface TaskDateChipProps {
  /** Signifier emoji shown before the date (📅 ⏳ 🛫 ✅ ❌ ➕). */
  icon?: string;
  /** ISO date string YYYY-MM-DD. */
  date: string;
  /** Red highlight when past. */
  overdue?: boolean;
}

export function TaskDateChip({ icon, date, overdue }: TaskDateChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] leading-none bg-[var(--sat-surface-2)] text-[var(--sat-text-secondary)] ${
        overdue ? "text-[var(--sat-state-error)]" : ""
      }`}
    >
      {icon ? <span className="mr-0.5">{icon}</span> : null}
      {formatDate(date)}
    </span>
  );
}