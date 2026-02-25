import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "../ui/command";
import { Dialog, DialogContent } from "../ui/dialog";

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

function groupByCategory(commands: CommandItemProps[]): Record<string, CommandItemProps[]> {
    const grouped: Record<string, CommandItemProps[]> = {};
    for (const cmd of commands) {
        const category = cmd.category || "General";
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(cmd);
    }
    return grouped;
}

export function CommandPalette({
    commands,
    onSelect,
    open,
    onOpenChange,
    placeholder,
}: CommandPaletteProps) {
    // Group commands by category
    const grouped = groupByCategory(commands);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="p-0 overflow-hidden shadow-2xl sm:max-w-[500px] border-none">
                <Command className="w-full flex flex-col h-full bg-[var(--sat-surface-1)]">
                    <CommandInput placeholder={placeholder ?? "Type a command..."} className="border-b-[var(--sat-layout-border)]" />
                    <CommandList className="h-full overflow-y-auto">
                        <CommandEmpty>No results found.</CommandEmpty>
                        {Object.entries(grouped).map(([category, cmds]) => (
                            <CommandGroup key={category} heading={category}>
                                {cmds.map((cmd) => (
                                    <CommandItem
                                        key={cmd.id}
                                        onSelect={() => {
                                            onSelect(cmd.id);
                                            onOpenChange(false);
                                        }}
                                        value={cmd.name}
                                    >
                                        {cmd.icon && <span className="mr-2 h-4 w-4 shrink-0 opacity-70 flex items-center">{cmd.icon}</span>}
                                        <span className="flex-1 text-[var(--sat-text-primary)] font-medium">
                                            {cmd.name}
                                        </span>
                                        {cmd.shortcut && (
                                            <span className="ml-auto text-xs tracking-widest text-[var(--sat-text-muted)] opacity-60">
                                                {cmd.shortcut}
                                            </span>
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
