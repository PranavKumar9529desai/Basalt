import { IconFilePlus as TablerIconFilePlus, IconPlus as TablerIconPlus, IconTrash as TablerIconTrash } from "@tabler/icons-react";

const IconFilePlus = TablerIconFilePlus as any;
const IconPlus = TablerIconPlus as any;
const IconTrash = TablerIconTrash as any;
import { globalCommandRegistry } from "@workspace/editor";
import type React from "react";
import { useEffect } from "react";

/**
 * Global commands for the Basalt application.
 * These are registered once at the root level.
 */
export const AppCommands: React.FC = () => {
  useEffect(() => {
    const unregisterers = [
      globalCommandRegistry.register({
        id: "app:new-file",
        name: "Create New Note",
        category: "File",
        icon: <IconFilePlus size={16} />,
        hotkeys: ["Ctrl+N"],
        callback: () => {
          console.log("Create new file command executed");
          // Implement actual file creation logic here (e.g., via Tauri/Rust)
        },
      }),
      globalCommandRegistry.register({
        id: "app:delete-file",
        name: "Delete Current Note",
        category: "File",
        icon: <IconTrash size={16} />,
        callback: () => {
          console.log("Delete file command executed");
          // Implement actual delete logic here
        },
      }),
      globalCommandRegistry.register({
        id: "app:extract-selection",
        name: "Extract selection to new note",
        category: "Editor",
        icon: <IconPlus size={16} />,
        callback: () => {
          console.log("Extract selection command executed");
        },
      }),
    ];

    return () => {
      unregisterers.forEach((unreg) => {
        unreg();
      });
    };
  }, []);

  return null;
};
