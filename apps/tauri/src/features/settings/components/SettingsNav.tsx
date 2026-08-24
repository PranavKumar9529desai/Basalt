import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/ui/command";
import { cn } from "@workspace/ui/lib/utils";
import { type SettingsGroup, useSettingsModalStore } from "../store";

const GROUP_LABELS: Record<SettingsGroup, string> = {
  options: "Options",
  "core-plugins": "Core plugins",
  "community-plugins": "Community plugins",
};

const GROUP_EMPTY: Record<string, string> = {
  "core-plugins": "No core plugin settings yet",
  "community-plugins": "No community plugins installed",
};

const GROUPS: SettingsGroup[] = [
  "options",
  "core-plugins",
  "community-plugins",
];

export function SettingsNav() {
  const { sections, activeSection, setActiveSection } = useSettingsModalStore();

  return (
    <Command className="flex flex-col h-full w-[220px] flex-shrink-0 rounded-none border-r border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]">
      <div className="px-3 pt-3 pb-2">
        <CommandInput
          placeholder="Search settings..."
          // eslint-disable-next-line jsx-a11y/no-autofocus -- Intentional: focus search when settings opens
          autoFocus
          className="h-8 text-xs"
        />
      </div>
      <CommandList className="flex-1 max-h-none overflow-y-auto px-2 pb-4">
        <CommandEmpty className="py-4 text-center text-xs italic text-muted-foreground">
          No settings found.
        </CommandEmpty>
        {GROUPS.map((group, i) => {
          const groupSections = sections.filter((s) => s.group === group);
          return (
            <CommandGroup
              key={group}
              heading={GROUP_LABELS[group]}
              className={cn(
                "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group-heading]]:text-muted-foreground",
                i === 0
                  ? "[&_[cmdk-group-heading]]:pt-2"
                  : "[&_[cmdk-group-heading]]:pt-6",
              )}
            >
              {groupSections.length === 0 && GROUP_EMPTY[group] ? (
                <p className="px-3 py-1 text-xs italic text-muted-foreground">
                  {GROUP_EMPTY[group]}
                </p>
              ) : (
                groupSections.map((section) => (
                  <CommandItem
                    key={section.id}
                    value={section.label}
                    onSelect={() => setActiveSection(section.id)}
                    className={cn(
                      "cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground",
                      "aria-selected:bg-accent aria-selected:text-accent-foreground",
                      "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                      activeSection === section.id
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    {section.label}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          );
        })}
      </CommandList>
    </Command>
  );
}
