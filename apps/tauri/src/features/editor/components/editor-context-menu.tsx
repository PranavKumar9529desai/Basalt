import { useCallback, useMemo, useState } from "react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuShortcut,
} from "@workspace/ui/components/ui/context-menu";
import { useCommandStore, contextMenuExtension, type ContextMenuState } from "@workspace/editor";
import { EditorComponent, type EditorProps } from "./editor-component";

export function Editor({ ...props }: EditorProps) {
    const [menuState, setMenuState] = useState<ContextMenuState | null>(null);

    const execute = useCommandStore((s) => s.execute);
    const commandsObj = useCommandStore((s) => s.commands);
    const commands = useMemo(() => Object.values(commandsObj), [commandsObj]);

    const handleCommand = useCallback(
        (commandId: string) => {
            setMenuState(null);
            execute(commandId);
        },
        [execute]
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
        <div className="flex-1 overflow-hidden relative">
            <ContextMenu
                open={!!menuState}
                onOpenChange={(open) => !open && setMenuState(null)}
            >
                <EditorComponent {...props} extensions={[cmExtension]} />

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
                                {cmd.hotkeys?.[0] && <ContextMenuShortcut>{cmd.hotkeys[0]}</ContextMenuShortcut>}
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
                                        {cmd.hotkeys?.[0] && <ContextMenuShortcut>{cmd.hotkeys[0]}</ContextMenuShortcut>}
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
