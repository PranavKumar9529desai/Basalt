import { IconChevronDown } from "@tabler/icons-react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/ui/command";
import { cn } from "@workspace/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TabItemData } from "./types";

export interface OverflowMenuProps {
  tabs: TabItemData[];
  /** How many tabs are visible in the strip; the rest live in this menu. */
  visibleTabCount: number;
  onSelectTab?: (tabId: string) => void;
}

// OverflowMenu — the chevron trigger plus the anchored dropdown listing
// hidden tabs. Owns its open/position UI state; purely presentational.
export function OverflowMenu({
  tabs,
  visibleTabCount,
  onSelectTab,
}: OverflowMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);

  // Close dropdown on Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dropdownOpen]);

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setDropdownPosition(null);
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Show all tabs"
        onClick={() => {
          setDropdownOpen(true);
          const rect = triggerRef.current?.getBoundingClientRect();
          if (rect) {
            setDropdownPosition({
              top: rect.bottom,
              right: window.innerWidth - rect.right,
            });
          }
        }}
        className="flex items-center gap-1 px-2 text-xs font-medium h-full transition-colors hover:bg-[var(--sat-surface-3)] text-[var(--sat-text-secondary)] hover:text-[var(--sat-text-primary)]"
      >
        <IconChevronDown size={16} stroke={2} />
        <span className="tabular-nums">
          {tabs.length - visibleTabCount > 0
            ? tabs.length - visibleTabCount
            : tabs.length}
        </span>
      </button>

      {dropdownOpen && dropdownPosition ? (
        <>
          {/* Backdrop — click to close */}
          <button
            type="button"
            aria-label="Close tab list"
            tabIndex={-1}
            className="fixed inset-0 z-50 cursor-default"
            onClick={closeDropdown}
          />
          {/* Dropdown menu anchored below the trigger button */}
          <div
            className="fixed z-50 mt-1 w-72 origin-top-right overflow-hidden rounded-lg border shadow-xl bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)]"
            style={{
              top: dropdownPosition.top,
              right: dropdownPosition.right,
            }}
          >
            <Command className="bg-transparent">
              <CommandList>
                {tabs.length > 0 ? (
                  <CommandGroup>
                    {tabs.map((tab) => (
                      <CommandItem
                        key={tab.id}
                        value={`${tab.title} ${tab.id}`}
                        onSelect={() => {
                          onSelectTab?.(tab.id);
                          closeDropdown();
                        }}
                        className={cn(
                          "cursor-pointer",
                          tab.isActive &&
                            "bg-[var(--sat-accent-primary)]/10 text-[var(--sat-accent-primary)]",
                        )}
                      >
                        <span className="truncate flex-1 text-sm">
                          {tab.title}
                        </span>
                        {tab.isDirty && (
                          <span
                            aria-hidden="true"
                            className="ml-2 inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--sat-accent-primary)]"
                          />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : (
                  <div className="px-3 py-4 text-xs text-[var(--sat-text-muted)] text-center">
                    No open tabs
                  </div>
                )}
              </CommandList>
            </Command>
          </div>
        </>
      ) : null}
    </>
  );
}
