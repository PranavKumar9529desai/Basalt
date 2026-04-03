import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
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
  onTabDrop?: (tabId: string, event: DragEvent<HTMLElement>, edge: "left" | "right") => void;
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [chrome, setChrome] = useState<TabsChromeLayout>({
    activeLeft: null,
    activeWidth: 0,
    separatorXs: [],
  });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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

  const checkScrollEdges = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const recalcChrome = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const activeEl = activeTabId ? tabRefs.current.get(activeTabId) : null;

    const activeLeft = activeEl
      ? activeEl.getBoundingClientRect().left - viewportRect.left
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
      const midX = (currentRect.right + nextRect.left) / 2 - viewportRect.left;
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
  }, [activeTabId, tabs]);

  useLayoutEffect(() => {
    recalcChrome();
    checkScrollEdges();
  }, [recalcChrome, checkScrollEdges]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onScroll = () => { recalcChrome(); checkScrollEdges(); };
    const onResize = () => { recalcChrome(); checkScrollEdges(); };
    viewport.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [recalcChrome, checkScrollEdges]);

  const [dropIndicator, setDropIndicator] = useState<{
    tabId: string;
    edge: "left" | "right";
  } | null>(null);
  // Ref mirrors state so handlers always read the latest value synchronously
  // without stale-closure issues.
  const dropIndicatorRef = useRef<{ tabId: string; edge: "left" | "right" } | null>(null);
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
      // Stop propagation so the outer tablist onDrop doesn't also fire.
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

  const scrollTabsLeft = useCallback(() => {
    viewportRef.current?.scrollBy({ left: -160, behavior: "smooth" });
  }, []);

  const scrollTabsRight = useCallback(() => {
    viewportRef.current?.scrollBy({ left: 160, behavior: "smooth" });
  }, []);

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      className={cn(
        "relative flex h-10 items-end gap-0 bg-[var(--sat-surface-2)] px-2 pt-1",
        className,
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        // Fires when the user drops in empty space (not on a tab).
        // Tab-level drops call stopPropagation so they don't reach here.
        e.preventDefault();
        const indicator = dropIndicatorRef.current;
        if (!indicator) return;
        setDropIndicatorBoth(null);
        onTabDrop?.(indicator.tabId, e as unknown as DragEvent<HTMLElement>, indicator.edge);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropIndicatorBoth(null);
        }
      }}
    >
      {leftSlot ? <div className="shrink-0">{leftSlot}</div> : null}
      <div className="relative h-full flex-1 min-w-0 overflow-visible">
        <ScrollArea className="h-full flex-1" viewportRef={viewportRef}>
          <div className="flex h-full min-w-max items-end gap-0">
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
                  dropIndicator?.tabId === tab.id ? dropIndicator.edge : undefined
                }
              />
            ))}
            {/* Explicit end drop zone — directly registers as a WKWebView drop
                target via onDragOver+preventDefault, so drops past the last tab
                are captured reliably without relying on event bubbling. */}
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
                  ) return;
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
        </ScrollArea>

        {/* Left scroll button — shown when content is scrolled right */}
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll tabs left"
            onClick={scrollTabsLeft}
            className="pointer-events-auto absolute left-0 top-0 z-30 flex h-full items-center bg-gradient-to-r from-[var(--sat-surface-2)] via-[var(--sat-surface-2)]/80 to-transparent pr-3 pl-0.5 text-[var(--sat-text-secondary)] hover:text-[var(--sat-text-primary)] transition-colors"
          >
            <IconChevronLeft size={14} />
          </button>
        )}

        {/* Right scroll button — shown when there is more content to the right */}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll tabs right"
            onClick={scrollTabsRight}
            className="pointer-events-auto absolute right-0 top-0 z-30 flex h-full items-center bg-gradient-to-l from-[var(--sat-surface-2)] via-[var(--sat-surface-2)]/80 to-transparent pl-3 pr-0.5 text-[var(--sat-text-secondary)] hover:text-[var(--sat-text-primary)] transition-colors"
          >
            <IconChevronRight size={14} />
          </button>
        )}

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
                className="absolute bottom-0 h-2 w-2 rounded-br-full bg-[var(--sat-surface-1)]"
                style={{ left: chrome.activeLeft - 8 }}
              />
              <span
                aria-hidden="true"
                className="absolute bottom-0 h-2 w-2 rounded-bl-full bg-[var(--sat-surface-1)]"
                style={{ left: chrome.activeLeft + chrome.activeWidth }}
              />
            </>
          ) : null}
        </div>
      </div>
      {rightSlot ? (
        <>
          <Separator
            orientation="vertical"
            className="h-5 bg-[var(--sat-layout-divider)]"
          />
          <div className="shrink-0">{rightSlot}</div>
        </>
      ) : null}
    </div>
  );
}
