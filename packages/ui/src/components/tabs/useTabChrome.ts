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

export function useTabChrome(tabs: TabItemData[]) {
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

    const onScroll = () => {
      recalcChrome();
      checkScrollEdges();
    };
    const onResize = () => {
      recalcChrome();
      checkScrollEdges();
    };
    viewport.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [recalcChrome, checkScrollEdges]);

  const scrollTabsLeft = useCallback(() => {
    viewportRef.current?.scrollBy({ left: -160, behavior: "smooth" });
  }, []);

  const scrollTabsRight = useCallback(() => {
    viewportRef.current?.scrollBy({ left: 160, behavior: "smooth" });
  }, []);

  return {
    viewportRef,
    tabRefs,
    chrome,
    canScrollLeft,
    canScrollRight,
    setTabRef,
    scrollTabsLeft,
    scrollTabsRight,
  };
}
