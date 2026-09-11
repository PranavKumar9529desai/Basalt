import { IconX } from "@tabler/icons-react";
import { useKeybindingService } from "@workspace/keybindings";
import { Button } from "@workspace/ui/components/ui/button";
import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";
import { useEffect } from "react";
import { useSettingsModalStore } from "../store";
import { SettingsNav } from "./SettingsNav";
import { SettingsPanel } from "./SettingsPanel";

export function SettingsModal() {
  const { isOpen, close } = useSettingsModalStore();
  const keybindingService = useKeybindingService();

  // Set "modalOpen" context for when clause evaluation
  useEffect(() => {
    keybindingService.setContext("modalOpen", isOpen);
    return () => keybindingService.setContext("modalOpen", false);
  }, [isOpen, keybindingService]);

  // Escape via keybinding service (kept for the global modalOpen when-clause);
  // Dialog owns backdrop/initial-focus. close() is idempotent, so both paths
  // coexisting is safe (no double-close).
  useEffect(() => {
    if (!isOpen) return;
    keybindingService.registerAction("closeTopModal", close);
    return () => keybindingService.unregisterAction("closeTopModal");
  }, [isOpen, close, keybindingService]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open) close();
      }}
    >
      <DialogContent
        overlayClassName="bg-black/60 backdrop-blur-[2px]"
        showCloseButton={false}
        aria-label="Settings"
        className="flex h-[85vh] w-[85vw] min-h-[480px] min-w-[720px] max-h-[85vh] max-w-[1100px] overflow-hidden rounded-xl bg-[var(--sat-surface-1)] p-0 shadow-2xl sm:max-w-none"
      >
        <SettingsNav />
        <SettingsPanel />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={close}
          className="absolute right-3.5 top-3.5 z-10 text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
          aria-label="Close settings"
        >
          <IconX size={16} />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
