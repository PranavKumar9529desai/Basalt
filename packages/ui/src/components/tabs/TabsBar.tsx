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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { TabItem } from "./TabItem";
import type { TabItemData } from "./types";

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

/** Max tabs visible in the tab strip before overflowing into the dropdown. */
const MAX_VISIBLE_TABS = 6;

interface TabsChromeLayout {
  activeLeft: number | null;
  activeWidth: number;
  separatorXs: number[];
}

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
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const [chrome, setChrome] = useState<TabsChromeLayout>({
    activeLeft: null,
    activeWidth: 0,
    separatorXs: [],
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<{
    top: number;
    right: number;
  } | null>(null);

  // ── Split tabs into visible + overflow ──────────────────────────────────
  // First `MAX_VISIBLE_TABS` tabs render in the tab strip; any beyond go into
  // the overflow dropdown only.
  const visibleTabs = tabs.slice(0, MAX_VISIBLE_TABS);
  const overflowTabs = tabs.slice(MAX_VISIBLE_TABS);

  // Close dropdown on Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dropdownOpen]);

  // Stable ref so scroll handler never needs to re-attach
  const activeTabIdRef = useRef<string | null>(null);
  activeTabIdRef.current = tabs.find((tab) => tab.isActive)?.id ?? null;

  const setTabRef = useCallback((tabId: string, el: HTMLDivElement | null) => {
    if (el) {
      tabRefs.current.set(tabId, el);
    } else {
      tabRefs.current.delete(tabId);
    }
  }, []);

  // ── Recalc chrome positions ──────────────────────────────────────────────

  const recalcChrome = useCallback(() => {
    const tabsEl = tabsRef.current;
    if (!tabsEl) return;

    const tabsRect = tabsEl.getBoundingClientRect();
    const activeId = activeTabIdRef.current;
    const activeEl = activeId ? tabRefs.current.get(activeId) : null;

    const activeLeft = activeEl
      ? activeEl.getBoundingClientRect().left - tabsRect.left
      : null;
    const activeWidth = activeEl ? activeEl.getBoundingClientRect().width : 0;

    const separatorXs: number[] = [];
    for (let i = 0; i < tabs.length - 1; i += 1) {
      const current = tabs[i];
      const next = tabs[i + 1];
      if (current.isActive || next.isActive) continue;

      const currentEl = tabRefs.current.get(current.id);
      const nextEl = tabRefs.current.get(next.id);
      if (!currentEl || !nextEl) continue;

      const currentRect = currentEl.getBoundingClientRect();
      const nextRect = nextEl.getBoundingClientRect();
      const midX = (currentRect.right + nextRect.left) / 2 - tabsRect.left;
      separatorXs.push(midX);
    }

    setChrome((prev) => {
      const sameActiveLeft = prev.activeLeft === activeLeft;
      const sameActiveWidth = prev.activeWidth === activeWidth;
      const sameSeparators =
        prev.separatorXs.length === separatorXs.length &&
        prev.separatorXs.every((value, idx) => value === separatorXs[idx]);
      if (sameActiveLeft && sameActiveWidth && sameSeparators) {
        return prev;
      }
      return { activeLeft, activeWidth, separatorXs };
    });
  }, [tabs]);

  // Recalc chrome on mount + whenever tabs change
  useLayoutEffect(() => {
    recalcChrome();
  }, [recalcChrome]);

  // ── Recalc active position on scroll (stable handler via ref) ────────────

  useEffect(() => {
    const tabsEl = tabsRef.current;
    if (!tabsEl) return;

    const onScroll = () => {
      const activeId = activeTabIdRef.current;
      if (!activeId) return;

      const el = tabRefs.current.get(activeId);
      if (!el) return;

      const containerRect = tabsEl.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const activeLeft = elRect.left - containerRect.left;
      const activeWidth = elRect.width;

      setChrome((prev) => {
        if (
          prev.activeLeft === activeLeft &&
          prev.activeWidth === activeWidth
        ) {
          return prev;
        }
        return { ...prev, activeLeft, activeWidth };
      });
    };

    tabsEl.addEventListener("scroll", onScroll);
    return () => tabsEl.removeEventListener("scroll", onScroll);
  }, []);

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
            dropIndicatorRef.current.edge === edge
            ? dropIndicatorRef.current
            : { tabId, edge },
        );
      }
      onTabDragOver?.(tabId, event);
    },
    [onTabDragOver, setDropIndicatorBoth],
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

  // ── Scroll helpers ───────────────────────────────────────────────────────

  const scrollActiveTabIntoView = useCallback(() => {
    const id = activeTabIdRef.current;
    if (!id) return;
    const el = tabRefs.current.get(id);
    el?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      className={cn(
        "z-50 relative flex h-10 items-end gap-0 bg-[var(--sat-surface-2)] px-2 pt-1 overflow-hidden",
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

      {/* ── Tabs strip: first MAX_VISIBLE_TABS tabs (with right padding for button) ── */}
      <div className="relative h-full flex-1 min-w-0 pr-10">
        <div
          ref={tabsRef}
          className="flex h-full items-end gap-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-webkit-scrollbar:none] scroll-smooth"
        >
          {visibleTabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              elementRef={(el) => setTabRef(tab.id, el)}
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
            />
          ))}
          {/* Explicit end drop zone */}
          {visibleTabs.length > 0 && (
            <div
              aria-hidden="true"
              className="h-full w-20 shrink-0"
              onDragOver={(e) => {
                e.preventDefault();
                const last = visibleTabs[visibleTabs.length - 1];
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
                const last = visibleTabs[visibleTabs.length - 1];
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

        {/* ── Chrome: separators + corner nubs ── */}
        <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
          {chrome.separatorXs.map((x, idx) => (
            <span
              key={`sep-${idx}-${x}`}
              aria-hidden="true"
              className="absolute top-[46%] h-4 w-px -translate-y-1/2 bg-[var(--sat-layout-divider,var(--sat-layout-border))]"
              style={{ left: `${x}px` }}
            />
          ))}

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
                  boxShadow: "0 0 0 40px var(--sat-editor-background)",
                  clipPath: "inset(50% 50% 0 -6px)",
                }}
              />
            </>
          ) : null}
        </div>
      </div>

      {/* ── Dropdown trigger — absolute right edge of outer container, never pushed ── */}
      <button
        ref={dropdownTriggerRef}
        type="button"
        aria-label="Show all tabs"
        onClick={() => {
          setDropdownOpen(true);
          const rect = dropdownTriggerRef.current?.getBoundingClientRect();
          if (rect) {
            setDropdownStyle({
              top: rect.bottom,
              right: window.innerWidth - rect.right,
            });
          }
        }}
        className={cn(
          "absolute right-0 top-0 z-[60] h-full flex items-center gap-1",
          "bg-[var(--sat-surface-2)] hover:bg-[var(--sat-surface-3)]",
          "text-[var(--sat-text-secondary)] hover:text-[var(--sat-text-primary)]",
          "px-2 text-xs font-medium transition-colors",
          visibleTabs.length > 0 &&
            "border-l border-[var(--sat-layout-border)]",
        )}
      >
        <IconChevronDown size={16} stroke={2} />
        {overflowTabs.length > 0 && (
          <span className="tabular-nums">{overflowTabs.length}</span>
        )}
      </button>

      {rightSlot ? (
        <>
          <Separator className="h-5 bg-[var(--sat-layout-divider)]" />
          <div className="shrink-0">{rightSlot}</div>
        </>
      ) : null}

      {/* ── Overflow dropdown (fixed position below trigger) ── */}
      {/* Shows tabs 7+ that don't fit in the tab strip */}
      {dropdownOpen && dropdownStyle ? (
        <>
          {/* Backdrop — click to close */}
          <button
            type="button"
            aria-label="Close tab list"
            tabIndex={-1}
            className="fixed inset-0 z-50 cursor-default"
            onClick={() => {
              setDropdownOpen(false);
              setDropdownStyle(null);
            }}
          />
          {/* Dropdown menu anchored below the trigger button */}
          <div
            className="fixed z-50 mt-1 w-72 origin-top-right overflow-hidden rounded-lg border shadow-xl bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)]"
            style={{ top: dropdownStyle.top, right: dropdownStyle.right }}
          >
            <Command className="bg-transparent">
              <CommandList>
                {overflowTabs.length > 0 ? (
                  <CommandGroup>
                    {overflowTabs.map((tab) => (
                      <CommandItem
                        key={tab.id}
                        value={`${tab.title} ${tab.id}`}
                        onSelect={() => {
                          onSelectTab?.(tab.id);
                          scrollActiveTabIntoView();
                          setDropdownOpen(false);
                          setDropdownStyle(null);
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
                    All tabs are visible
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
