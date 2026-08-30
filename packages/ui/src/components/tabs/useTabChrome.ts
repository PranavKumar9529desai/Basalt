import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TabItemData } from "./types";

export interface TabsChromeLayout {
  /** Left edge of the visible active tab, relative to the strip container (null when hidden). */
  activeLeft: number | null;
  /** Width of the visible active tab (0 when hidden). */
  activeWidth: number;
  /** X positions of the 1px separators between inactive tabs. */
  separatorXs: number[];
}

export function useTabChrome(
  tabs: TabItemData[],
  visibleTabCount?: number,
  visibleTabStart = 0,
) {
  const containerRef = useRef<HTMLDivElement>(null);
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
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const activeEl = activeTabId ? tabRefs.current.get(activeTabId) : null;

    const visibleCount = visibleTabCount ?? tabs.length;

    // Only draw the active-tab corner nubs when the active tab is actually
    // visible (not overflowed into the dropdown).
    const activeIndex = activeTabId
      ? tabs.findIndex((t) => t.id === activeTabId)
      : -1;
    const isActiveVisible =
      activeIndex >= visibleTabStart &&
      activeIndex < visibleTabStart + visibleCount;

    const activeLeft =
      activeEl && isActiveVisible
        ? activeEl.getBoundingClientRect().left - containerRect.left
        : null;
    const activeWidth =
      activeEl && isActiveVisible ? activeEl.getBoundingClientRect().width : 0;

    // Separators only between visible tabs, skipping any pair adjacent to the
    // active tab (Chrome draws no divider there).
    const separatorXs: number[] = [];
    const firstSeparator = visibleTabStart;
    const lastSeparator = Math.min(
      tabs.length - 1,
      visibleTabStart + visibleCount - 1,
    );
    for (let i = firstSeparator; i < lastSeparator; i += 1) {
      const current = tabs[i];
      const next = tabs[i + 1];
      if (current.isActive || next.isActive) continue;

      const currentEl = tabRefs.current.get(current.id);
      const nextEl = tabRefs.current.get(next.id);
      if (!currentEl || !nextEl) continue;

      const currentRect = currentEl.getBoundingClientRect();
      const nextRect = nextEl.getBoundingClientRect();
      const midX = (currentRect.right + nextRect.left) / 2 - containerRect.left;
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
  }, [activeTabId, tabs, visibleTabCount, visibleTabStart]);

  // Layout effect on mount/change
  useLayoutEffect(() => {
    recalcChrome();
  }, [recalcChrome]);

  // ResizeObserver — recalc chrome when container resizes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      recalcChrome();
    });
    ro.observe(container);

    return () => ro.disconnect();
  }, [recalcChrome]);

  return {
    containerRef,
    tabRefs,
    chrome,
    setTabRef,
  };
}
