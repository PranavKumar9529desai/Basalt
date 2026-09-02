import { cn } from "@workspace/ui/lib/utils";

export interface PenLineIconProps {
  size?: number;
  className?: string;
}

/**
 * The pen "edit view" glyph — pixel-identical to Obsidian's `lucide-edit-3`
 * (later renamed `lucide-pen-line`) icon (the mode toggle shows this while in
 * reading view to indicate "switch to edit view"). Vendored from Lucide (ISC
 * license).
 */
export function PenLineIcon({ size = 16, className }: PenLineIconProps) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z" />
      <path d="M15 5l3 3" />
    </svg>
  );
}
