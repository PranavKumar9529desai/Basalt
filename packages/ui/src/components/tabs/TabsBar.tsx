import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
import { Separator } from "@workspace/ui/components/ui/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, MouseEvent, ReactNode } from "react";
import { TabItem } from "./TabItem";
import type { TabItemData } from "./types";
import { useTabChrome } from "./useTabChrome";
import { useTabDnD } from "./useTabDnD";

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
  const {
    viewportRef,
    tabRefs,
    chrome,
    canScrollLeft,
    canScrollRight,
    setTabRef,
    scrollTabsLeft,
    scrollTabsRight,
  } = useTabChrome(tabs);

  const {
    dropIndicator,
    dropIndicatorRef,
    setDropIndicatorBoth,
    handleTabDragOver,
    handleTabDrop,
    handleTabDragEnd,
  } = useTabDnD(onTabDragOver, onTabDrop, onTabDragEnd, tabRefs);

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
                onDragOver={handleTabDragOver}
                onDrop={handleTabDrop}
                onDragEnd={handleTabDragEnd}
                showDropIndicator={
                  dropIndicator?.tabId === tab.id
                    ? dropIndicator.edge
                    : undefined
                }
              />
            ))}
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
        </ScrollArea>

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
