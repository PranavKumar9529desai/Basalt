import { IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import { useCallback, useEffect, useRef } from "react";
import { useSettingsStore } from "../store";
import { SettingsNav } from "./SettingsNav";
import { SettingsPanel } from "./SettingsPanel";

export function SettingsModal() {
  const { isOpen, close } = useSettingsStore();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [isOpen, close]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        close();
      }
    },
    [close],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={handleBackdropClick}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative flex w-[85vw] h-[85vh] overflow-hidden rounded-xl bg-[var(--sat-surface-1)] shadow-2xl"
      >
        <SettingsNav />
        <SettingsPanel />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={close}
          className="absolute right-3 top-3 text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
          aria-label="Close settings"
        >
          <IconX size={14} />
        </Button>
      </div>
    </div>
  );
}
