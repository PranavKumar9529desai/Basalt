import {
  IconFilePlus,
  IconFileSearch,
  IconPinned,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
  IconX,
  IconLayoutBoardSplit,
  IconRectangleVertical,
} from "@tabler/icons-react";
import { useCommandStore } from "@workspace/editor";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useSearchStore } from "../features/search";
import { useSettingsStore } from "../features/settings";

export interface AppCommandsProps {
  onCreateNote?: () => void;
  onDeleteNote?: () => void;
  onCloseActiveTab?: () => void;
  onCloseOtherTabs?: () => void;
  onCloseTabsToRight?: () => void;
  onTogglePinActiveTab?: () => void;
  onSplitRight?: () => void;
  onSplitLeft?: () => void;
  onSplitTop?: () => void;
  onSplitBottom?: () => void;
  hasActiveTab?: boolean;
}

export const AppCommands: React.FC<AppCommandsProps> = ({
  onCreateNote,
  onDeleteNote,
  onCloseActiveTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onTogglePinActiveTab,
  onSplitRight,
  onSplitLeft,
  onSplitTop,
  onSplitBottom,
  hasActiveTab = false,
}) => {
  const register = useCommandStore((s) => s.register);
  const unregister = useCommandStore((s) => s.unregister);

  const openSearch   = useSearchStore((s) => s.openSearch);
  const openSwitcher = useSearchStore((s) => s.openSwitcher);
  const openSettings = useSettingsStore((s) => s.open);

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
      {
        id: "tabs:close-active",
        name: "Close Current Tab",
        category: "Tabs",
        icon: <IconX size={16} />,
        hotkeys: ["Ctrl+W"],
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onCloseActiveTab) onCloseActiveTab();
        },
      },
      {
        id: "tabs:close-others",
        name: "Close Other Tabs",
        category: "Tabs",
        icon: <IconRectangleVertical size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onCloseOtherTabs) onCloseOtherTabs();
        },
      },
      {
        id: "tabs:close-right",
        name: "Close Tabs to the Right",
        category: "Tabs",
        icon: <IconRectangleVertical size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onCloseTabsToRight) onCloseTabsToRight();
        },
      },
      {
        id: "tabs:toggle-pin",
        name: "Pin/Unpin Current Tab",
        category: "Tabs",
        icon: <IconPinned size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onTogglePinActiveTab) onTogglePinActiveTab();
        },
      },
      {
        id: "tabs:split-right",
        name: "Split Right and Move Tab",
        category: "Tabs",
        icon: <IconLayoutBoardSplit size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onSplitRight) onSplitRight();
        },
      },
      {
        id: "tabs:split-left",
        name: "Split Left and Move Tab",
        category: "Tabs",
        icon: <IconLayoutBoardSplit size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onSplitLeft) onSplitLeft();
        },
      },
      {
        id: "tabs:split-up",
        name: "Split Up and Move Tab",
        category: "Tabs",
        icon: <IconLayoutBoardSplit size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onSplitTop) onSplitTop();
        },
      },
      {
        id: "tabs:split-down",
        name: "Split Down and Move Tab",
        category: "Tabs",
        icon: <IconLayoutBoardSplit size={16} />,
        checkCallback: () => hasActiveTab,
        callback: () => {
          if (onSplitBottom) onSplitBottom();
        },
      },
      {
        id: "search:open",
        name: "Search Vault",
        category: "Search",
        icon: <IconSearch size={16} />,
        hotkeys: ["Ctrl+F", "Meta+F"],
        callback: openSearch,
      },
      {
        id: "switcher:open",
        name: "Quick Open File",
        category: "Search",
        icon: <IconFileSearch size={16} />,
        hotkeys: ["Ctrl+O", "Meta+O"],
        callback: openSwitcher,
      },
      {
        id: "app:open-settings",
        name: "Open Settings",
        category: "App",
        icon: <IconSettings size={16} />,
        hotkeys: ["Ctrl+,", "Meta+,"],
        callback: openSettings,
      },
    ],
    [
      hasActiveTab,
      onCloseActiveTab,
      onCloseOtherTabs,
      onCloseTabsToRight,
      onCreateNote,
      onDeleteNote,
      onSplitBottom,
      onSplitLeft,
      onSplitRight,
      onSplitTop,
      onTogglePinActiveTab,
      openSearch,
      openSettings,
      openSwitcher,
    ],
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        openSwitcher();
      } else if (e.key === ",") {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [openSearch, openSettings, openSwitcher]);

  return null;
};
