import type { ReactNode } from "react";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";

export interface DialogFrameProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

/**
 * Shared dialog chrome for the app's prompt-style dialogs (input/confirm).
 * Provides the themed surface, header, title and optional description that
 * both InputDialog and ConfirmDialog would otherwise duplicate.
 */
export function DialogFrame({ title, description, children }: DialogFrameProps) {
  return (
    <DialogContent className="sm:max-w-[400px] bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)]">
      <DialogHeader>
        <DialogTitle className="text-[var(--sat-text-primary)]">
          {title}
        </DialogTitle>
        {description && (
          <DialogDescription className="text-[var(--sat-text-muted)]">
            {description}
          </DialogDescription>
        )}
      </DialogHeader>
      {children}
    </DialogContent>
  );
}
