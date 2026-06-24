import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--sat-text-primary)]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[var(--sat-text-muted)]">
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[var(--sat-text-secondary)] hover:text-[var(--sat-text-primary)]"
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className={
              variant === "destructive"
                ? "bg-[var(--sat-state-danger)] text-[var(--sat-text-inverse)] hover:opacity-90"
                : "bg-[var(--sat-accent-primary)] text-[var(--sat-text-inverse)] hover:opacity-90"
            }
          >
            {isLoading ? "Loading…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
