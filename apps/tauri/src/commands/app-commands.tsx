import {
  IconFilePlus,
  IconPinned,
  IconPlus,
  IconTrash,
  IconX,
  IconLayoutBoardSplit,
  IconRectangleVertical,
} from "@tabler/icons-react";
import { useCommandStore } from "@workspace/editor";
import type React from "react";
import { useEffect, useMemo, useRef } from "react";

export interface AppCommandsProps {
  onCreateNote?: () => void;
  onDeleteNote?: () => void;
  onCloseActiveTab?: () => void;
  onCloseOtherTabs?: () => void;
  onCloseTabsToRight?: () => void;
  onTogglePinActiveTab?: () => void;
  onSplitRight?: () => void;
  hasActiveTab?: boolean;
}

/**
 * Global commands for the Basalt application.
 */
export const AppCommands: React.FC<AppCommandsProps> = ({
  onCreateNote,
  onDeleteNote,
  onCloseActiveTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onTogglePinActiveTab,
  onSplitRight,
  hasActiveTab = false,
}) => {
  const register = useCommandStore((s) => s.register);
  const unregister = useCommandStore((s) => s.unregister);

  const onCreateNoteRef = useRef(onCreateNote);
  const onDeleteNoteRef = useRef(onDeleteNote);
  const onCloseActiveTabRef = useRef(onCloseActiveTab);
  const onCloseOtherTabsRef = useRef(onCloseOtherTabs);
  const onCloseTabsToRightRef = useRef(onCloseTabsToRight);
  const onTogglePinActiveTabRef = useRef(onTogglePinActiveTab);
  const onSplitRightRef = useRef(onSplitRight);
  const hasActiveTabRef = useRef(hasActiveTab);

  useEffect(() => {
    onCreateNoteRef.current = onCreateNote;
    onDeleteNoteRef.current = onDeleteNote;
    onCloseActiveTabRef.current = onCloseActiveTab;
    onCloseOtherTabsRef.current = onCloseOtherTabs;
    onCloseTabsToRightRef.current = onCloseTabsToRight;
    onTogglePinActiveTabRef.current = onTogglePinActiveTab;
    onSplitRightRef.current = onSplitRight;
    hasActiveTabRef.current = hasActiveTab;
  }, [
    hasActiveTab,
    onCloseActiveTab,
    onCloseOtherTabs,
    onCloseTabsToRight,
    onCreateNote,
    onDeleteNote,
    onSplitRight,
    onTogglePinActiveTab,
  ]);

  const commands = useMemo(
    () => [
      {
        id: "app:new-file",
        name: "Create New Note",
        category: "File",
        icon: <IconFilePlus size={16} />,
        hotkeys: ["Ctrl+N"],
        callback: () => {
          if (onCreateNoteRef.current) onCreateNoteRef.current();
          else console.log("Create new file command executed");
        },
      },
      {
        id: "app:delete-file",
        name: "Delete Current Note",
        category: "File",
        icon: <IconTrash size={16} />,
        callback: () => {
          if (onDeleteNoteRef.current) onDeleteNoteRef.current();
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
        checkCallback: () => hasActiveTabRef.current,
        callback: () => {
          if (onCloseActiveTabRef.current) onCloseActiveTabRef.current();
        },
      },
      {
        id: "tabs:close-others",
        name: "Close Other Tabs",
        category: "Tabs",
        icon: <IconRectangleVertical size={16} />,
        checkCallback: () => hasActiveTabRef.current,
        callback: () => {
          if (onCloseOtherTabsRef.current) onCloseOtherTabsRef.current();
        },
      },
      {
        id: "tabs:close-right",
        name: "Close Tabs to the Right",
        category: "Tabs",
        icon: <IconRectangleVertical size={16} />,
        checkCallback: () => hasActiveTabRef.current,
        callback: () => {
          if (onCloseTabsToRightRef.current) onCloseTabsToRightRef.current();
        },
      },
      {
        id: "tabs:toggle-pin",
        name: "Pin/Unpin Current Tab",
        category: "Tabs",
        icon: <IconPinned size={16} />,
        checkCallback: () => hasActiveTabRef.current,
        callback: () => {
          if (onTogglePinActiveTabRef.current) onTogglePinActiveTabRef.current();
        },
      },
      {
        id: "tabs:split-right",
        name: "Split Right and Move Tab",
        category: "Tabs",
        icon: <IconLayoutBoardSplit size={16} />,
        checkCallback: () => hasActiveTabRef.current,
        callback: () => {
          if (onSplitRightRef.current) onSplitRightRef.current();
        },
      },
    ],
    [],
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
