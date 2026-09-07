import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { memo, useCallback, useRef } from "react";
import { TabItem } from "./TabItem";
import type { TabItemData } from "./types";
import { useTabChrome } from "./useTabChrome";
import { useTabDragDrop } from "./useTabDragDrop";
import { useTabOverflow } from "./useTabOverflow";
import { OverflowMenu } from "./OverflowMenu";

export interface TabsBarProps {
  tabs: TabItemData[];
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onPinToggle?: (tabId: string) => void;
  onTabContextMenu?: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  /** Pane id stamped on every pill (`data-tab-pane-id`) for pointer drag hit-testing. */
  dataPaneId?: string;
  onTabPointerDown?: (tabId: string, event: PointerEvent<HTMLElement>) => void;
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

// TabItemCell wraps TabItem with a stable elementRef callback so that
// React.memo on TabItem is not defeated by a new inline function every
// render. All other event handlers pass through as stable references.
interface TabItemCellProps {
  tab: TabItemData;
  setTabRef: (id: string, el: HTMLDivElement | null) => void;
  onSelect?: (tabId: string) => void;
  onClose?: (tabId: string) => void;
  onPinToggle?: (tabId: string) => void;
  onContextMenu?: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  dataPaneId?: string;
  onPointerDown?: (tabId: string, event: PointerEvent<HTMLElement>) => void;
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
  dataPaneId,
  onPointerDown,
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
      dataPaneId={dataPaneId}
      onPointerDown={onPointerDown}
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
  dataPaneId,
  onTabPointerDown,
  onTabDragStart,
  onTabDragOver,
  onTabDrop,
  onTabDragEnd,
  leftSlot,
  rightSlot,
  className,
}: TabsBarProps) {
  const dropdownWrapperRef = useRef<HTMLDivElement>(null);

  // Extract overflow computation so the visible window is known before
  // computing chrome (which only draws for visible tabs). Also owns the
  // container/tab refs shared with useTabChrome.
  const { containerRef, tabRefs, visibleTabCount, visibleTabStart } =
    useTabOverflow(tabs, dropdownWrapperRef);

  // Use the extracted useTabChrome hook with visibleTabCount so chrome is
  // only computed for tabs that aren't hidden
  const { chrome, setTabRef } = useTabChrome(
    tabs,
    containerRef,
    tabRefs,
    visibleTabCount,
    visibleTabStart,
  );

  const {
    dropIndicator,
    dropIndicatorRef,
    setDropIndicatorBoth,
    handleInternalDragOver,
    handleInternalDrop,
    handleInternalDragEnd,
  } = useTabDragDrop(tabRefs, onTabDragOver, onTabDrop, onTabDragEnd);

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      tabIndex={-1}
      // No z-index here: the bar background must stay BELOW the shell's
      // HeaderBandRule (z-10), while the active tab and chrome nubs (z-20)
      // carve through it. A z-index on this root would lift the opaque
      // background above the line and hide it.
      className={cn(
        "pt-[0.5px] relative flex h-10 items-end gap-0 bg-[var(--sat-surface-2)] px-2 overflow-hidden",
        className,
      )}
      onKeyDown={(event) => {
        if (!onSelectTab) return;
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }
        const target =
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>("[data-tab-id]")
            : null;
        const currentId = target?.dataset.tabId;
        if (!currentId) return;
        const currentIndex = tabs.findIndex((tab) => tab.id === currentId);
        if (currentIndex < 0) return;
        const nextIndex =
          event.key === "ArrowLeft"
            ? (currentIndex - 1 + tabs.length) % tabs.length
            : event.key === "ArrowRight"
              ? (currentIndex + 1) % tabs.length
              : event.key === "Home"
                ? 0
                : tabs.length - 1;
        const nextTab = tabs[nextIndex];
        if (!nextTab || nextTab.disabled) return;
        event.preventDefault();
        onSelectTab(nextTab.id);
        requestAnimationFrame(() => tabRefs.current.get(nextTab.id)?.focus());
      }}
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

      {/* Tab strip — overflow hidden keeps every tab inside one row */}
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
              dataPaneId={dataPaneId}
              onPointerDown={onTabPointerDown}
              onDragStart={onTabDragStart}
              onDragOver={handleInternalDragOver}
              onDrop={handleInternalDrop}
              onDragEnd={handleInternalDragEnd}
              showDropIndicator={
                tab.dropEdge ??
                (dropIndicator?.tabId === tab.id
                  ? dropIndicator.edge
                  : undefined)
              }
              hidden={
                index < visibleTabStart ||
                index >= visibleTabStart + visibleTabCount
              }
            />
          ))}
          {/* Explicit end drop zone */}
          {tabs.length > 0 && visibleTabCount > 0 && (
            <div
              aria-hidden="true"
              className="h-full w-20 shrink-0"
              onDragOver={(e) => {
                e.preventDefault();
                const last = tabs[visibleTabStart + visibleTabCount - 1];
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
                const last = tabs[visibleTabStart + visibleTabCount - 1];
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

        {/* Chrome — separators + active-tab corner nubs */}
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

      {/* End controls: overflow dropdown trigger + rightSlot in one
          container, grouped at the right edge of the tab bar. */}
      <div
        ref={dropdownWrapperRef}
        // No opaque background: it would chop the HeaderBandRule hairline
        // short of the right edge.
        // self-stretch overrides the root's items-end so buttons center
        // vertically in the h-10 bar (tabs stay bottom-aligned).
        className="shrink-0 self-stretch flex items-center"
      >
        <OverflowMenu
          tabs={tabs}
          visibleTabCount={visibleTabCount}
          onSelectTab={onSelectTab}
        />
        {rightSlot ? (
          <>
            <div className="w-px h-5 self-center bg-[var(--sat-layout-divider,var(--sat-layout-border))]" />
            <div className="shrink-0">{rightSlot}</div>
          </>
        ) : null}
      </div>
    </div>
  );
}
