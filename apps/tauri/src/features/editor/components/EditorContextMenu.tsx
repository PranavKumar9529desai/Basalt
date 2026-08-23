import type { EditorView } from "@codemirror/view";
import { commandService } from "@workspace/commands";
import { type ContextMenuState } from "@workspace/editor";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@workspace/ui/components/ui/context-menu";
import { useCallback, useMemo } from "react";
import { useEditorCommands } from "../hooks/useEditorCommands";

export interface EditorContextMenuProps {
  /** null = closed. Coordinates come from the CM contextMenu extension. */
  menuState: ContextMenuState | null;
  onMenuStateChange: (state: ContextMenuState | null) => void;
  /** The live EditorView — wires format commands into the palette. */
  view: EditorView | null;
  onSearch?: (query: string) => void;
}

/**
 * Presentational context-menu overlay for the editor. Anchored at the
 * right-click coordinates emitted by the CM contextMenu extension; the
 * menu state lives in the leaf component so it survives document swaps.
 */
export function EditorContextMenu({
  menuState,
  onMenuStateChange,
  view,
  onSearch,
}: EditorContextMenuProps) {
  useEditorCommands(view);

  const commands = useMemo(() => commandService.getCommands(), []);

  const handleCommand = useCallback(
    (commandId: string) => {
      onMenuStateChange(null);
      commandService.execute(commandId);
    },
    [onMenuStateChange],
  );

  const menuAnchor = useMemo(() => {
    if (!menuState) return null;
    return {
      getBoundingClientRect: () =>
        new DOMRect(menuState.x, menuState.y, 0, 0),
    };
  }, [menuState]);

  const formatCommands = commands.filter((c) => c.category === "Format");
  const editorCommands = commands.filter((c) => c.category === "Editor");

  return (
    <ContextMenu
      open={!!menuState}
      onOpenChange={(open) => !open && onMenuStateChange(null)}
    >
      {menuState && (
        <ContextMenuContent anchor={menuAnchor}>
          {editorCommands.map((cmd) => (
            <ContextMenuItem
              key={cmd.id}
              onClick={() => handleCommand(cmd.id)}
            >
              <div className="mr-2 flex size-4 shrink-0 items-center justify-center opacity-90">
                {cmd.icon}
              </div>
              <span>{cmd.name}</span>
            </ContextMenuItem>
          ))}

          <ContextMenuSeparator />

          {menuState.selection.text && (
            <>
              <ContextMenuItem
                onClick={() => {
                  onSearch?.(menuState.selection.text);
                  onMenuStateChange(null);
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
                  <div className="mr-2 flex size-4 shrink-0 items-center justify-center opacity-90">
                    {cmd.icon}
                  </div>
                  <span>{cmd.name}</span>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
