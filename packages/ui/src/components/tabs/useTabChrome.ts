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
  activeLeft: number | null;
  activeWidth: number;
  separatorXs: number[];
}

export function useTabChrome(tabs: TabItemData[], visibleTabCount?: number) {
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

    // Only show active corners if the active tab is visible
    const activeIndex = activeTabId
      ? tabs.findIndex((t) => t.id === activeTabId)
      : -1;
    const isActiveVisible = activeIndex >= 0 && activeIndex < visibleCount;

    const activeLeft =
      activeEl && isActiveVisible
        ? activeEl.getBoundingClientRect().left - containerRect.left
        : null;
    const activeWidth =
      activeEl && isActiveVisible ? activeEl.getBoundingClientRect().width : 0;

    // Compute separators only between visible (non-hidden) tabs
    const separatorXs: number[] = [];
    const maxSep = Math.min(tabs.length - 1, visibleCount - 1);
    for (let i = 0; i < maxSep; i += 1) {
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
  }, [activeTabId, tabs, visibleTabCount]);

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
