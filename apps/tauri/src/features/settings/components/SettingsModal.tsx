import { useEffect } from "react";
import { IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import { useSettingsStore } from "../store";
import { SettingsNav } from "./SettingsNav";
import { SettingsPanel } from "./SettingsPanel";

export function SettingsModal() {
  const { isOpen, close } = useSettingsStore();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-50 flex bg-[var(--sat-surface-1)]"
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
  );
}
