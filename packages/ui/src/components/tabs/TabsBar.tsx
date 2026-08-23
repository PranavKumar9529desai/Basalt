import { IconChevronDown } from "@tabler/icons-react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/ui/command";
import { Separator } from "@workspace/ui/components/ui/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, MouseEvent, ReactNode } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { TabItem } from "./TabItem";
import type { TabItemData } from "./types";
import { useTabChrome } from "./useTabChrome";

export interface TabsBarProps {
  tabs: TabItemData[];
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onPinToggle?: (tabId: string) => void;
  onTabContextMenu?: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  onTabDragStart?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onTabDragOver?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onTabDrop?: (
    tabId: string,
    event: DragEvent<HTMLElement>,
    edge: "left" | "right",
  ) => void;
  onTabDragEnd?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
}

// --------------------------------------------------------------------------
// TabItemCell — wraps TabItem with a stable elementRef callback so that
// React.memo on TabItem is not defeated by a new inline function every
// render.  All other event handlers pass through as stable references.
// --------------------------------------------------------------------------

interface TabItemCellProps {
  tab: TabItemData;
  setTabRef: (id: string, el: HTMLDivElement | null) => void;
  onSelect?: (tabId: string) => void;
  onClose?: (tabId: string) => void;
  onPinToggle?: (tabId: string) => void;
  onContextMenu?: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onDragOver?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onDrop?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  showDropIndicator?: "left" | "right";
  hidden?: boolean;
}

const TabItemCell = memo(function TabItemCell({
  tab,
  setTabRef,
  onSelect,
  onClose,
  onPinToggle,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  showDropIndicator,
  hidden,
}: TabItemCellProps) {
  const elementRef = useCallback(
    (el: HTMLDivElement | null) => setTabRef(tab.id, el),
    [tab.id, setTabRef],
  );

  return (
    <TabItem
      tab={tab}
      elementRef={elementRef}
      onSelect={onSelect}
      onClose={onClose}
      onPinToggle={onPinToggle}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      showDropIndicator={showDropIndicator}
      hidden={hidden}
    />
  );
});

export function TabsBar({
  tabs,
  onSelectTab,
  onCloseTab,
  onPinToggle,
  onTabContextMenu,
  onTabDragStart,
  onTabDragOver,
  onTabDrop,
  onTabDragEnd,
  leftSlot,
  rightSlot,
  className,
}: TabsBarProps) {
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownWrapperRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);

  // ── Overflow measurement (visibility-based, no scrolling) ───────────────

  const tabWidthsRef = useRef<Map<string, number>>(new Map());
  const [visibleTabCount, setVisibleTabCount] = useState(tabs.length);

  // Use the extracted useTabChrome hook with visibleTabCount so chrome is
  // only computed for tabs that aren't hidden
  const { containerRef, tabRefs, chrome, setTabRef } = useTabChrome(
    tabs,
    visibleTabCount,
  );

  const recalcOverflow = useCallback(() => {
    const container = containerRef.current;
    const dropdownWrapper = dropdownWrapperRef.current;
    if (!container) return;

    const dropdownWidth = dropdownWrapper?.offsetWidth || 0;
    const availableWidth = container.clientWidth - dropdownWidth - 8; // 8px buffer

    let usedWidth = 0;
    let count = 0;

    for (const tab of tabs) {
      const el = tabRefs.current.get(tab.id);
      if (!el) break;

      // Measure width — if 0 (display:none), use cached value from when it was visible
      const measuredWidth = el.offsetWidth;
      if (measuredWidth > 0) {
        tabWidthsRef.current.set(tab.id, measuredWidth);
      }
      const effectiveWidth = tabWidthsRef.current.get(tab.id) || 170;

      usedWidth += effectiveWidth;
      if (usedWidth <= availableWidth) {
        count++;
      } else {
        break;
      }
    }

    setVisibleTabCount(Math.max(1, Math.min(count, tabs.length)));
  }, [tabs, containerRef]);

  // ResizeObserver on the container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => recalcOverflow());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recalcOverflow, containerRef]);

  // Also recalc when tabs change
  useEffect(() => {
    recalcOverflow();
  }, [recalcOverflow, tabs.length]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dropdownOpen]);

  // ── Drag-and-drop indicator state ────────────────────────────────────────

  const [dropIndicator, setDropIndicator] = useState<{
    tabId: string;
    edge: "left" | "right";
  } | null>(null);
  const dropIndicatorRef = useRef<{
    tabId: string;
    edge: "left" | "right";
  } | null>(null);
  const setDropIndicatorBoth = useCallback(
    (val: { tabId: string; edge: "left" | "right" } | null) => {
      dropIndicatorRef.current = val;
      setDropIndicator(val);
    },
    [],
  );

  const handleInternalDragOver = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>) => {
      const el = tabRefs.current.get(tabId);
      if (el) {
        const rect = el.getBoundingClientRect();
        const edge: "left" | "right" =
          event.clientX < (rect.left + rect.right) / 2 ? "left" : "right";
        setDropIndicatorBoth(
          dropIndicatorRef.current?.tabId === tabId &&
            dropIndicatorRef.current?.edge === edge
            ? dropIndicatorRef.current
            : { tabId, edge },
        );
      }
      onTabDragOver?.(tabId, event);
    },
    [onTabDragOver, setDropIndicatorBoth, tabRefs],
  );

  const handleInternalDrop = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>) => {
      const indicator = dropIndicatorRef.current;
      setDropIndicatorBoth(null);
      event.stopPropagation();
      if (indicator) {
        onTabDrop?.(tabId, event, indicator.edge);
      }
    },
    [onTabDrop, setDropIndicatorBoth],
  );

  const handleInternalDragEnd = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>) => {
      setDropIndicatorBoth(null);
      onTabDragEnd?.(tabId, event);
    },
    [onTabDragEnd, setDropIndicatorBoth],
  );

  // ── Dropdown helpers ─────────────────────────────────────────────────────

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setDropdownPosition(null);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      // No z-index here: the bar background must stay BELOW the shell's
      // StripSeparator (z-10), while the active tab and chrome nubs (z-20)
      // carve through it. A z-index on this root would lift the opaque
      // background above the line and hide it.
      className={cn(
        "pt-[0.5px] relative flex h-10 items-end gap-0 bg-[var(--sat-surface-2)] px-2 overflow-hidden",
        className,
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const indicator = dropIndicatorRef.current;
        if (!indicator) return;
        setDropIndicatorBoth(null);
        onTabDrop?.(
          indicator.tabId,
          e as unknown as DragEvent<HTMLElement>,
          indicator.edge,
        );
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropIndicatorBoth(null);
        }
      }}
    >
      {leftSlot ? <div className="shrink-0">{leftSlot}</div> : null}

      {/* ── Tab strip: overflow hidden, all tabs inside ── */}
      <div
        ref={containerRef}
        className="relative flex-1 min-w-0 h-full overflow-hidden"
      >
        <div className=" flex h-full items-end gap-0">
          {tabs.map((tab, index) => (
            <TabItemCell
              key={tab.id}
              tab={tab}
              setTabRef={setTabRef}
              onSelect={onSelectTab}
              onClose={onCloseTab}
              onPinToggle={onPinToggle}
              onContextMenu={onTabContextMenu}
              onDragStart={onTabDragStart}
              onDragOver={handleInternalDragOver}
              onDrop={handleInternalDrop}
              onDragEnd={handleInternalDragEnd}
              showDropIndicator={
                dropIndicator?.tabId === tab.id ? dropIndicator.edge : undefined
              }
              hidden={index >= visibleTabCount}
            />
          ))}
          {/* Explicit end drop zone */}
          {tabs.length > 0 && (
            <div
              aria-hidden="true"
              className="h-full w-20 shrink-0"
              onDragOver={(e) => {
                e.preventDefault();
                const last = tabs[tabs.length - 1];
                if (!last) return;
                if (
                  dropIndicatorRef.current?.tabId === last.id &&
                  dropIndicatorRef.current.edge === "right"
                )
                  return;
                setDropIndicatorBoth({ tabId: last.id, edge: "right" });
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const last = tabs[tabs.length - 1];
                if (!last) return;
                setDropIndicatorBoth(null);
                onTabDrop?.(
                  last.id,
                  e as unknown as DragEvent<HTMLElement>,
                  "right",
                );
              }}
            />
          )}
        </div>

        {/* ── Chrome: separators + active-tab corner nubs ── */}
        <div className="pointer-events-none absolute inset-0 z-20">
          {chrome.separatorXs.map((x, idx) => (
            <span
              key={`sep-${idx}-${x}`}
              aria-hidden="true"
              className="absolute top-[46%] h-4 w-px -translate-y-1/2 bg-[var(--sat-layout-divider,var(--sat-layout-border))]"
              style={{ left: `${x}px` }}
            />
          ))}

          {/* Melt: erase the bottom separator beneath the active tab so it
              blends straight into the editor pane (Obsidian-style). The nub
              arcs below reconnect the line to the tab's side borders. */}
          {chrome.activeLeft !== null && chrome.activeWidth > 0 ? (
            <span
              aria-hidden="true"
              className="absolute bottom-0 h-[2px] bg-[var(--sat-editor-background)]"
              style={{ left: chrome.activeLeft, width: chrome.activeWidth }}
            />
          ) : null}

          {/* Concave cutouts at the active tab's bottom corners — the
              "chrome nubs". A circle flooded with editor-background shadow,
              clipped to its outer quadrant, carves the notch that makes the
              active tab blend into the editor pane below. Pure CSS, no SVG. */}
          {chrome.activeLeft !== null && chrome.activeWidth > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="absolute bottom-0 pointer-events-none"
                style={{
                  left: chrome.activeLeft - 12,
                  width: 12,
                  height: 12,
                  borderRadius: "100%",
                  border: "1px solid var(--sat-layout-border)",
                  boxShadow: "0 0 0 40px var(--sat-editor-background)",
                  clipPath: "inset(50% -6px 0 50%)",
                }}
              />
              <span
                aria-hidden="true"
                className="absolute bottom-0 pointer-events-none"
                style={{
                  left: chrome.activeLeft + chrome.activeWidth,
                  width: 12,
                  height: 12,
                  borderRadius: "100%",
                  border: "1px solid var(--sat-layout-border)",
                  boxShadow: "0 0 0 40px var(--sat-editor-background)",
                  clipPath: "inset(50% 50% 0 -6px)",
                }}
              />
            </>
          ) : null}
        </div>
      </div>

      {/* ── Dropdown trigger — sticky at right edge ── */}
      <div
        ref={dropdownWrapperRef}
        // No opaque background: it would chop the StripSeparator hairline
        // short of the right edge.
        className="shrink-0 flex items-stretch"
      >
        {tabs.length > 0 && (
          <div className="w-px h-5 self-center bg-[var(--sat-layout-divider,var(--sat-layout-border))]" />
        )}
        <button
          ref={dropdownTriggerRef}
          type="button"
          aria-label="Show all tabs"
          onClick={() => {
            setDropdownOpen(true);
            const rect = dropdownTriggerRef.current?.getBoundingClientRect();
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
      </div>

      {rightSlot ? (
        <>
          <Separator className="h-5 bg-[var(--sat-layout-divider)]" />
          <div className="shrink-0">{rightSlot}</div>
        </>
      ) : null}

      {/* ── Dropdown (fixed position below trigger) ── */}
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
    </div>
  );
}
