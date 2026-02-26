import {
  useCommandStore,
  type Command,
} from "@workspace/editor/commands/store";
import { useState, useEffect, useMemo } from "react";
import { CommandPalette } from "@workspace/ui/components/command-palette/CommandPalette";

export function EditorCommandPalette() {
  const commandsObj = useCommandStore((s) => s.commands);
  const commands = useMemo(() => {
    return Object.values(commandsObj).filter(
      (cmd) => !cmd.checkCallback || cmd.checkCallback(),
    );
  }, [commandsObj]);
  const execute = useCommandStore((s) => s.execute);
  const [open, setOpen] = useState(false);

  // Global Ctrl+P listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <CommandPalette
      commands={commands.map((c: Command) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        shortcut: c.hotkeys?.[0],
        category: c.category,
      }))}
      onSelect={execute}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
