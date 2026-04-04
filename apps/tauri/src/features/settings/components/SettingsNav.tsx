import { cn } from "@workspace/ui/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/ui/command";
import { Separator } from "@workspace/ui/components/ui/separator";
import { type SettingsGroup, useSettingsStore } from "../store";

const GROUP_LABELS: Record<SettingsGroup, string> = {
  options: "Options",
  "core-plugins": "Core plugins",
  "community-plugins": "Community plugins",
};

const GROUP_EMPTY: Record<string, string> = {
  "core-plugins": "No core plugin settings yet",
  "community-plugins": "No community plugins installed",
};

const GROUPS: SettingsGroup[] = ["options", "core-plugins", "community-plugins"];

export function SettingsNav() {
  const { sections, activeSection, setActiveSection } = useSettingsStore();

  return (
    <Command className="flex flex-col h-full w-[210px] flex-shrink-0 rounded-none border-r border-[--sat-border-default] bg-[--sat-surface-2]">
      <div className="px-2 pt-3 pb-1">
        <CommandInput
          placeholder="Search settings..."
          autoFocus
          className="h-8 text-xs"
        />
      </div>
      <CommandList className="flex-1 max-h-none overflow-y-auto px-1 pb-4">
        <CommandEmpty className="py-4 text-center text-xs italic text-[--sat-text-muted]">
          No settings found.
        </CommandEmpty>
        {GROUPS.map((group, i) => {
          const groupSections = sections.filter((s) => s.group === group);
          return (
            <div key={group}>
              {i > 0 && (
                <Separator className="my-2 bg-[--sat-border-default]" />
              )}
              <CommandGroup
                heading={GROUP_LABELS[group]}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[--sat-text-muted]"
              >
                {groupSections.length === 0 && GROUP_EMPTY[group] ? (
                  <p className="px-2 py-1.5 text-xs italic text-[--sat-text-muted]">
                    {GROUP_EMPTY[group]}
                  </p>
                ) : (
                  groupSections.map((section) => (
                    <CommandItem
                      key={section.id}
                      value={section.label}
                      onSelect={() => setActiveSection(section.id)}
                      className={cn(
                        "cursor-pointer rounded-[4px] px-2 py-1.5 text-[13px] text-[--sat-text-muted]",
                        "data-[selected=true]:bg-[--sat-layout-surface-raised] data-[selected=true]:text-[--sat-text-primary]",
                        activeSection === section.id &&
                          "bg-[--sat-layout-surface-raised] text-[--sat-text-primary]",
                      )}
                    >
                      {section.label}
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </Command>
  );
}
