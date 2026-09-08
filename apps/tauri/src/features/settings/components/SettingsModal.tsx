import { IconX } from "@tabler/icons-react";
import { useKeybindingService } from "@workspace/keybindings";
import { Button } from "@workspace/ui/components/ui/button";
import { useCallback, useEffect, useRef } from "react";
import { useSettingsModalStore } from "../store";
import { SettingsNav } from "./SettingsNav";
import { SettingsPanel } from "./SettingsPanel";

export function SettingsModal() {
  const { isOpen, close } = useSettingsModalStore();
  const dialogRef = useRef<HTMLDivElement>(null);
  const keybindingService = useKeybindingService();

  // Set "modalOpen" context for when clause evaluation
  useEffect(() => {
    keybindingService.setContext("modalOpen", isOpen);
    return () => keybindingService.setContext("modalOpen", false);
  }, [isOpen, keybindingService]);

  // Register Escape action for closing settings
  useEffect(() => {
    if (!isOpen) return;
    keybindingService.registerAction("closeTopModal", close);
    return () => keybindingService.unregisterAction("closeTopModal");
  }, [isOpen, close, keybindingService]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={handleBackdropClick}
      />
      <div
        ref={dialogRef}
        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- Custom modal chrome; native <dialog> would change stacking/styling
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative flex h-[85vh] w-[85vw] min-h-[480px] min-w-[720px] max-h-[85vh] max-w-[1100px] overflow-hidden rounded-xl bg-[var(--sat-surface-1)] shadow-2xl"
      >
        <SettingsNav />
        <SettingsPanel />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={close}
          className="absolute right-3.5 top-3.5 text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
          aria-label="Close settings"
        >
          <IconX size={16} />
        </Button>
      </div>
    </div>
  );
}
