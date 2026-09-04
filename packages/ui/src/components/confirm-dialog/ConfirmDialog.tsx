import { Button } from "../ui/button";
import { Dialog, DialogFooter } from "../ui/dialog";
import { DialogFrame } from "../ui/dialog-frame";

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
      <DialogFrame title={title} description={description}>
        <DialogFooter className="mt-4">
          <Button
            variant="sat-ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={
              variant === "destructive" ? "sat-destructive" : "sat-primary"
            }
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Loading…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogFrame>
    </Dialog>
  );
}
