import { IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { useSettingsStore } from "../store";
import { SettingsNav } from "./SettingsNav";
import { SettingsPanel } from "./SettingsPanel";

export function SettingsModal() {
  const { isOpen, close } = useSettingsStore();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 top-0 left-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 p-0 bg-[--sat-bg-primary]"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex h-full">
          <SettingsNav />
          <SettingsPanel />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={close}
          className="absolute right-3 top-3 text-[--sat-text-muted] hover:text-[--sat-text-primary]"
          aria-label="Close settings"
        >
          <IconX size={14} />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
