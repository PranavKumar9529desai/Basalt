import { IconFilePlus, IconPlus, IconTrash } from "@tabler/icons-react";
import { useCommandStore } from "@workspace/editor";
import type React from "react";
import { useEffect, useMemo } from "react";

export interface AppCommandsProps {
  onCreateNote?: () => void;
  onDeleteNote?: () => void;
}

/**
 * Global commands for the Basalt application.
 */
export const AppCommands: React.FC<AppCommandsProps> = ({
  onCreateNote,
  onDeleteNote,
}) => {
  const register = useCommandStore((s) => s.register);
  const unregister = useCommandStore((s) => s.unregister);

  const commands = useMemo(
    () => [
      {
        id: "app:new-file",
        name: "Create New Note",
        category: "File",
        icon: <IconFilePlus size={16} />,
        hotkeys: ["Ctrl+N"],
        callback: () => {
          if (onCreateNote) onCreateNote();
          else console.log("Create new file command executed");
        },
      },
      {
        id: "app:delete-file",
        name: "Delete Current Note",
        category: "File",
        icon: <IconTrash size={16} />,
        callback: () => {
          if (onDeleteNote) onDeleteNote();
          else console.log("Delete file command executed");
        },
      },
      {
        id: "app:extract-selection",
        name: "Extract selection to new note",
        category: "Editor",
        icon: <IconPlus size={16} />,
        callback: () => {
          console.log("Extract selection command executed");
        },
      },
    ],
    [onCreateNote, onDeleteNote],
  );

  useEffect(() => {
    commands.forEach((c) => {
      register(c);
    });
    return () => {
      commands.forEach((c) => {
        unregister(c.id);
      });
    };
  }, [commands, register, unregister]);

  return null;
};
