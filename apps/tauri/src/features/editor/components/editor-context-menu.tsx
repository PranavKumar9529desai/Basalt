import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useCommandStore } from "@workspace/commands";
import { type ContextMenuState, contextMenuExtension } from "@workspace/editor";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@workspace/ui/components/ui/context-menu";
import { useCallback, useMemo, useState } from "react";
import { useEditorCommands } from "../hooks/useEditorCommands";

import { EditorComponent, type EditorProps } from "./editor-component";

export function Editor({ ...props }: EditorProps) {
  const [view, setView] = useState<ReactCodeMirrorRef["view"] | null>(null);
  useEditorCommands(view);

  const [menuState, setMenuState] = useState<ContextMenuState | null>(null);

  const execute = useCommandStore((s) => s.execute);
  const commandsObj = useCommandStore((s) => s.commands);
  const commands = useMemo(() => Object.values(commandsObj), [commandsObj]);

  const handleCommand = useCallback(
    (commandId: string) => {
      setMenuState(null);
      execute(commandId);
    },
    [execute],
  );

  const menuAnchor = useMemo(() => {
    if (!menuState) return null;
    return {
      getBoundingClientRect: () => new DOMRect(menuState.x, menuState.y, 0, 0),
    };
  }, [menuState]);

  const formatCommands = commands.filter((c) => c.category === "Format");
  const editorCommands = commands.filter((c) => c.category === "Editor");

  const cmExtension = useMemo(() => contextMenuExtension(setMenuState), []);

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <ContextMenu
        open={!!menuState}
        onOpenChange={(open) => !open && setMenuState(null)}
      >
        <EditorComponent
          {...props}
          extensions={[cmExtension]}
          onViewReady={setView}
        />

        {menuState && (
          <ContextMenuContent anchor={menuAnchor}>
            {editorCommands.map((cmd) => (
              <ContextMenuItem
                key={cmd.id}
                onClick={() => handleCommand(cmd.id)}
              >
                <div className="flex size-4 shrink-0 items-center justify-center opacity-90 mr-2">
                  {cmd.icon}
                </div>
                <span>{cmd.name}</span>
                {cmd.hotkeys?.[0] && (
                  <ContextMenuShortcut>{cmd.hotkeys[0]}</ContextMenuShortcut>
                )}
              </ContextMenuItem>
            ))}

            <ContextMenuSeparator />

            {menuState.selection.text && (
              <>
                <ContextMenuItem
                  onClick={() => {
                    props.onSearch?.(menuState.selection.text);
                    setMenuState(null);
                  }}
                >
                  Search for "{menuState.selection.text}"
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}

            <ContextMenuSub>
              <ContextMenuSubTrigger>Format</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {formatCommands.map((cmd) => (
                  <ContextMenuItem
                    key={cmd.id}
                    onClick={() => handleCommand(cmd.id)}
                  >
                    <div className="flex size-4 shrink-0 items-center justify-center opacity-90 mr-2">
                      {cmd.icon}
                    </div>
                    <span>{cmd.name}</span>
                    {cmd.hotkeys?.[0] && (
                      <ContextMenuShortcut>
                        {cmd.hotkeys[0]}
                      </ContextMenuShortcut>
                    )}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        )}
      </ContextMenu>
    </div>
  );
}
