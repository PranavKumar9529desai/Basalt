import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "../ui/command";
import { Dialog, DialogContent } from "../ui/dialog";
import React from "react";
import { useCommandState } from "cmdk";
import { IconArrowUp, IconArrowDown, IconCornerDownLeft, IconX } from "@tabler/icons-react";

export interface CommandItemProps {
    id: string;
    name: string;
    icon?: React.ReactNode;
    shortcut?: string;
    category?: string;
}

export interface CommandPaletteProps {
    commands: CommandItemProps[];
    onSelect: (id: string) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    placeholder?: string;
}

function HighlightedText({ text }: { text: string }) {
    const search = useCommandState((state) => state.search);

    if (!search) return <span>{text}</span>;

    const index = text.toLowerCase().indexOf(search.toLowerCase());
    if (index === -1) return <span>{text}</span>;

    return (
        <span>
            {text.substring(0, index)}
            <span className="text-foreground font-bold underline underline-offset-2">
                {text.substring(index, index + search.length)}
            </span>
            {text.substring(index + search.length)}
        </span>
    );
}

export function CommandPalette({
    commands,
    onSelect,
    open,
    onOpenChange,
    placeholder,
}: CommandPaletteProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="p-0 overflow-hidden shadow-2xl sm:max-w-[650px] border-none ring-0 focus:ring-0 bg-popover top-[15vh] translate-y-0"
                showCloseButton={false}
            >
                <Command
                    className="w-full flex flex-col h-fit bg-transparent border-none p-0"
                    label="Command Palette"
                    loop
                >
                    <div className="flex items-center w-full pr-4">
                        <CommandInput
                            placeholder={placeholder ?? "Type a command..."}
                            className="flex-1"
                            autoFocus
                        />
                        <button
                            onClick={() => onOpenChange(false)}
                            className="size-5 rounded-full bg-muted hover:bg-muted-foreground/40 transition-all flex items-center justify-center text-foreground/70 hover:text-foreground shrink-0"
                        >
                            <IconX size={10} strokeWidth={3} />
                        </button>
                    </div>

                    <div className="h-px bg-border/20 mx-4" />

                    <CommandList className="max-h-[450px] overflow-y-auto px-2 py-2 w-full no-scrollbar">
                        <CommandEmpty className="py-12 text-muted-foreground text-center text-sm">No commands found.</CommandEmpty>
                        <CommandGroup>
                            {commands.map((cmd) => (
                                <CommandItem
                                    key={cmd.id}
                                    onSelect={() => {
                                        onSelect(cmd.id);
                                        onOpenChange(false);
                                    }}
                                    value={`${cmd.name} ${cmd.id}`}
                                    className="flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        {cmd.icon && <span className="h-4 w-4 shrink-0 opacity-70 group-aria-selected/command-item:opacity-100 transition-opacity flex items-center">{cmd.icon}</span>}
                                        <span className="text-foreground">
                                            <HighlightedText text={cmd.name} />
                                        </span>
                                    </div>
                                    {cmd.shortcut && (
                                        <div className="flex items-center gap-1 opacity-40 group-aria-selected/command-item:opacity-100 transition-opacity">
                                            {cmd.shortcut.split("+").map((key, i) => (
                                                <React.Fragment key={key}>
                                                    <kbd className="text-[10px] font-sans uppercase">
                                                        {key}
                                                    </kbd>
                                                    {i < cmd.shortcut!.split("+").length - 1 && <span className="text-[10px]">+</span>}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>

                    {/* Footer */}
                    <div className="flex justify-center items-center gap-6 px-4 py-2.5 border-border/10 bg-muted/5 mt-auto w-full">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                            <div className="flex items-center gap-0.5">
                                <IconArrowUp size={10} className="" />
                                <IconArrowDown size={10} className="" />
                            </div>
                            <span>to navigate</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                            <IconCornerDownLeft size={10} className="" />
                            <span>to use</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                            <span className="px-1.5 py-0.5 rounded text-[9px] uppercase">esc</span>
                            <span>to dismiss</span>
                        </div>
                    </div>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
