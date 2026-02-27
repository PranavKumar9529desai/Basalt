import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
import { Separator } from "@workspace/ui/components/ui/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  onTabDrop?: (tabId: string, event: DragEvent<HTMLElement>) => void;
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
      const midX =
        ((currentRect.right + nextRect.left) / 2) - viewportRect.left;
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
  }, [recalcChrome]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onScroll = () => recalcChrome();
    const onResize = () => recalcChrome();
    viewport.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [recalcChrome]);

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      className={cn(
        "relative flex h-10 items-end gap-0 bg-[var(--sat-surface-2)] px-2 pt-1",
        className,
      )}
    >
      {leftSlot ? <div className="shrink-0">{leftSlot}</div> : null}
      <div className="relative h-full flex-1 min-w-0 overflow-visible">
        <ScrollArea className="h-full flex-1" viewportRef={viewportRef}>
          <div className="flex h-full min-w-max items-end gap-0 pr-2">
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
                onDragOver={onTabDragOver}
                onDrop={onTabDrop}
                onDragEnd={onTabDragEnd}
              />
            ))}
          </div>
        </ScrollArea>

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
            null
          ) : null}
        </div>
      </div>
      {rightSlot ? (
        <>
          <Separator orientation="vertical" className="h-5 bg-[var(--sat-layout-divider)]" />
          <div className="shrink-0">{rightSlot}</div>
        </>
      ) : null}
    </div>
  );
}
