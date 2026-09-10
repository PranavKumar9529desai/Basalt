import { useCallback, useEffect, useRef, useState } from "react";
import type { TabItemData } from "./types";

/**
 * useTabOverflow — owns the container/tab refs shared with useTabChrome, and
 * computes which tabs fit in the strip and which overflow into the dropdown.
 * Measures each tab's width, then fills left/right from the active tab so it
 * is never hidden by overflow.
 */
const MIN_TAB_WIDTH = 90;

export function useTabOverflow(
  tabs: TabItemData[],
  reserveWidthRef?: React.RefObject<HTMLElement | null>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [visibleTabCount, setVisibleTabCount] = useState(tabs.length);
  const [visibleTabStart, setVisibleTabStart] = useState(0);

  const recalcOverflow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // The container is a flex-1 sibling of the end controls, so container.clientWidth
    // is already the exact width of the tab strip.
    const availableWidth = container.clientWidth;

    if (tabs.length === 0) {
      setVisibleTabStart(0);
      setVisibleTabCount(0);
      return;
    }

    // Maximum number of tabs that can physically fit at minimum tab width (90px)
    const maxFittingTabs = Math.max(
      1,
      Math.floor(availableWidth / MIN_TAB_WIDTH),
    );
    const count = Math.min(tabs.length, maxFittingTabs);

    if (count >= tabs.length) {
      setVisibleTabStart(0);
      setVisibleTabCount(tabs.length);
      return;
    }

    // Keep the active tab centered/visible within the sliding window
    const activeIndex = tabs.findIndex((tab) => tab.isActive);
    const anchor = activeIndex >= 0 ? activeIndex : 0;

    let start = Math.max(0, anchor - Math.floor(count / 2));
    if (start + count > tabs.length) {
      start = Math.max(0, tabs.length - count);
    }

    setVisibleTabStart(start);
    setVisibleTabCount(count);
  }, [tabs, containerRef]);

  // ResizeObserver on the container
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
  }, [recalcOverflow, tabs]);

  return { containerRef, tabRefs, visibleTabCount, visibleTabStart };
}
