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
                className="p-0 overflow-hidden shadow-2xl sm:max-w-[650px] border-none bg-[var(--sat-surface-1)]"
                showCloseButton={false}
            >
                <Command
                    className="w-full flex flex-col h-full bg-transparent border-none p-0"
                    label="Command Palette"
                >
                    <div className="flex items-center w-full pr-4">
                        <CommandInput
                            placeholder={placeholder ?? "Type a command..."}
                            className="flex-1"
                            autoFocus
                        />
                        <button
                            onClick={() => onOpenChange(false)}
                            className="p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground/30 hover:text-muted-foreground shrink-0"
                        >
                            <IconX size={14} />
                        </button>
                    </div>

                    <div className="h-px bg-border/20 mx-4" />

                    <CommandList className="max-h-[450px] overflow-y-auto px-2 py-2 w-full">
                        <CommandEmpty className="py-12 text-muted-foreground text-center text-sm">No commands found.</CommandEmpty>
                        <CommandGroup>
                            {commands.map((cmd) => (
                                <CommandItem
                                    key={cmd.id}
                                    onSelect={() => {
                                        onSelect(cmd.id);
                                        onOpenChange(false);
                                    }}
                                    value={cmd.name}
                                    className="flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        {cmd.icon && <span className="h-4 w-4 shrink-0 opacity-70 flex items-center">{cmd.icon}</span>}
                                        <span className="text-[var(--sat-text-primary)]">
                                            <HighlightedText text={cmd.name} />
                                        </span>
                                    </div>
                                    {cmd.shortcut && (
                                        <div className="flex items-center gap-1 opacity-40">
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
                    <div className="flex justify-center items-center gap-4 px-4 py-2.5 border-t border-border/20 bg-muted/5 mt-auto w-full">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                            <div className="flex items-center gap-0.5">
                                <IconArrowUp size={11} className="opacity-50" />
                                <IconArrowDown size={11} className="opacity-50" />
                            </div>
                            <span>to navigate</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                            <IconCornerDownLeft size={11} className="opacity-50" />
                            <span>to use</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[9px] border border-border/50 uppercase">esc</span>
                            <span>to dismiss</span>
                        </div>
                    </div>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
