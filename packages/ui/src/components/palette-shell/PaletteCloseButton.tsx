import { IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";

export interface PaletteCloseButtonProps {
  onClick?: () => void;
  className?: string;
}

/** Small round × button used in PaletteShell header rows to dismiss. */
export function PaletteCloseButton({
  onClick,
  className,
}: PaletteCloseButtonProps) {
  return (
    <Button
      aria-label="Close"
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn(
        "size-5 rounded-full bg-muted hover:bg-muted-foreground/40 transition-all flex items-center justify-center text-foreground/70 hover:text-foreground shrink-0",
        className,
      )}
    >
      <IconX size={10} strokeWidth={3} />
    </Button>
  );
}
