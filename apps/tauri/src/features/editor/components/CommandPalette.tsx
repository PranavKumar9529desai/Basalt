import { type Command, commandService } from "@workspace/commands";
import { useKeybindingService } from "@workspace/keybindings";
import { CommandPalette } from "@workspace/ui/components/command-palette/CommandPalette";
import { useEffect, useState } from "react";

export function EditorCommandPalette() {
  const keybindingService = useKeybindingService();
  const [open, setOpen] = useState(false);

  // Register Ctrl+P action
  useEffect(() => {
    keybindingService.registerAction("openCommandPalette", () => setOpen(true));
    return () => keybindingService.unregisterAction("openCommandPalette");
  }, [keybindingService]);

  // Read commands fresh each time palette opens (commands are registered at import time)
  const commands = open ? commandService.getCommands() : [];

  return (
    <CommandPalette
      commands={commands.map((c: Command) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        shortcut: undefined,
        category: c.category,
      }))}
      onSelect={(id) => commandService.execute(id)}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
