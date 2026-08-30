import { cn } from "@workspace/ui/lib/utils";

export interface BookOpenIconProps {
  size?: number;
  className?: string;
}

/**
 * The open-book "reading view" glyph — pixel-identical to Obsidian's
 * `lucide-book-open` icon (the mode toggle shows this while in edit mode to
 * indicate "switch to reading view"). Vendored from Lucide (ISC license).
 */
export function BookOpenIcon({ size = 16, className }: BookOpenIconProps) {
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
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}