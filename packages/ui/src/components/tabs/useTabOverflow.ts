import { useCallback, useEffect, useRef, useState } from "react";
import type { TabItemData } from "./types";

/**
 * useTabOverflow — owns the container/tab refs shared with useTabChrome, and
 * computes which tabs fit in the strip and which overflow into the dropdown.
 * Measures each tab's width, then fills left/right from the active tab so it
 * is never hidden by overflow.
 */
export function useTabOverflow(
  tabs: TabItemData[],
  reserveWidthRef?: React.RefObject<HTMLElement | null>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const tabWidthsRef = useRef<Map<string, number>>(new Map());
  const [visibleTabCount, setVisibleTabCount] = useState(tabs.length);
  const [visibleTabStart, setVisibleTabStart] = useState(0);

  const recalcOverflow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const reserved = reserveWidthRef?.current?.offsetWidth ?? 0;
    const availableWidth = container.clientWidth - reserved - 8; // 8px buffer

    const widths = tabs.map((tab) => {
      const el = tabRefs.current.get(tab.id);
      const measuredWidth = el?.offsetWidth ?? 0;
      if (measuredWidth > 0) {
        tabWidthsRef.current.set(tab.id, measuredWidth);
      }
      return tabWidthsRef.current.get(tab.id) || 170;
    });

    if (tabs.length === 0) {
      setVisibleTabStart(0);
      setVisibleTabCount(0);
      return;
    }

    // Keep the active tab in the strip. Fill to the right first, then use
    // remaining space on the left so overflow never hides the current tab.
    const activeIndex = tabs.findIndex((tab) => tab.isActive);
    const anchor = activeIndex >= 0 ? activeIndex : 0;
    let start = anchor;
    let end = anchor + 1;
    let usedWidth = widths[anchor] ?? 170;
    while (end < tabs.length && usedWidth + widths[end] <= availableWidth) {
      usedWidth += widths[end] ?? 170;
      end += 1;
    }
    while (start > 0 && usedWidth + widths[start - 1] <= availableWidth) {
      start -= 1;
      usedWidth += widths[start] ?? 170;
    }

    setVisibleTabStart(start);
    setVisibleTabCount(Math.max(1, end - start));
  }, [tabs, containerRef, tabRefs, reserveWidthRef]);

  // ResizeObserver on the container — also fires when the reserved dropdown
  // width changes since it resizes the row.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => recalcOverflow());
    ro.observe(container);
    if (reserveWidthRef?.current) ro.observe(reserveWidthRef.current);
    return () => ro.disconnect();
  }, [recalcOverflow, containerRef, reserveWidthRef]);

  // Also recalc when tabs change
  useEffect(() => {
    recalcOverflow();
  }, [recalcOverflow, tabs.length]);

  return { containerRef, tabRefs, visibleTabCount, visibleTabStart };
}
