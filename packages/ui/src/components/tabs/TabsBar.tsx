import { IconChevronDown } from "@tabler/icons-react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/ui/command";
import {
  Dialog,
  DialogContent,
} from "@workspace/ui/components/ui/dialog";
import { Separator } from "@workspace/ui/components/ui/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, MouseEvent, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
  const [chrome, setChrome] = useState<TabsChromeLayout>({
    activeLeft: null,
    activeWidth: 0,
    separatorXs: [],
  });
  const [hasOverflow, setHasOverflow] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeTabId = useMemo(
    () => tabs.find((tab) => tab.isActive)?.id ?? null,
    [tabs],
  );

  const setTabRef = useCallback((tabId: string, el: HTMLDivElement | null) => {
    if (el) {
      tabRefs.current.set(tabId, el);
    } else {
      tabRefs.current.delete(tabId);
    }
  }, []);

  // ── Recalc chrome + overflow detection ──────────────────────────────────

  const recalcChrome = useCallback(() => {
    const tabsEl = tabsRef.current;
    if (!tabsEl) return;

    const tabsRect = tabsEl.getBoundingClientRect();
    const activeEl = activeTabId ? tabRefs.current.get(activeTabId) : null;

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

    // Detect overflow — compare scroll width to client width.
    // Use Math.ceil to avoid sub-pixel false positives.
    const overflow = Math.ceil(tabsEl.scrollWidth) > Math.ceil(tabsEl.clientWidth);
    setHasOverflow(overflow);


  }, [activeTabId, tabs]);

  // Recalc on mount + whenever tabs change
  useLayoutEffect(() => {
    recalcChrome();
  }, [recalcChrome]);

  // ── Recalc on scroll + resize ────────────────────────────────────────────

  useEffect(() => {
    const tabsEl = tabsRef.current;
    if (!tabsEl) return;

    const onScrollOrResize = () => recalcChrome();
    tabsEl.addEventListener("scroll", onScrollOrResize);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      tabsEl.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [recalcChrome]);

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
    if (!activeTabId) return;
    const el = tabRefs.current.get(activeTabId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      className={cn(
        "relative flex h-10 items-end gap-0 bg-[var(--sat-surface-2)] px-2 pt-1 overflow-hidden",
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

      {/* ── Tabs container: native horizontal scroll ── */}
      <div className="relative h-full flex-1 min-w-0">
        <div
          ref={tabsRef}
          className="flex h-full items-end gap-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-webkit-scrollbar:none] scroll-smooth"
        >
          {tabs.map((tab) => (
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
                dropIndicator?.tabId === tab.id
                  ? dropIndicator.edge
                  : undefined
              }
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

        {/* ── Overflow dropdown trigger ── */}
        {hasOverflow && (
          <button
            type="button"
            aria-label="Show all tabs"
            onClick={() => {
              setDropdownOpen(true);
              // Recalc overflow after dropdown closes in case tabs were closed
            }}
            className={cn(
              "pointer-events-auto absolute right-0 top-0 z-[60] flex h-full items-center",
              "bg-[var(--sat-surface-2)] hover:bg-[var(--sat-surface-3)]",
              "text-[var(--sat-text-secondary)] hover:text-[var(--sat-text-primary)]",
              "pl-2 pr-2 text-xs font-medium transition-colors border-l border-[var(--sat-layout-border)]",
            )}
          >
            <IconChevronDown size={16} stroke={2} />
            <span className="ml-1 tabular-nums">{tabs.length}</span>
          </button>
        )}

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

      {rightSlot ? (
        <>
          <Separator className="h-5 bg-[var(--sat-layout-divider)]" />
          <div className="shrink-0">{rightSlot}</div>
        </>
      ) : null}

      {/* ── All-tabs dropdown ── */}
      <Dialog open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DialogContent
          className="p-0 overflow-hidden border shadow-lg bg-[var(--sat-surface-2)] sm:max-w-[320px] top-auto translate-y-0 bottom-12 left-auto right-4"
          showCloseButton={false}
        >
          <Command className="bg-transparent">
            <CommandList>
              <CommandGroup>
                {tabs.map((tab) => (
                  <CommandItem
                    key={tab.id}
                    value={`${tab.title} ${tab.id}`}
                    onSelect={() => {
                      onSelectTab?.(tab.id);
                      scrollActiveTabIntoView();
                      setDropdownOpen(false);
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
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}
