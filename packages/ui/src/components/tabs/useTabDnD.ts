import type { DragEvent } from "react";
import { useCallback, useRef, useState } from "react";

type DropIndicator = { tabId: string; edge: "left" | "right" };

export function useTabDnD(
  onTabDragOver?: (tabId: string, event: DragEvent<HTMLElement>) => void,
  onTabDrop?: (
    tabId: string,
    event: DragEvent<HTMLElement>,
    edge: "left" | "right",
  ) => void,
  onTabDragEnd?: (tabId: string, event: DragEvent<HTMLElement>) => void,
  tabRefs?: React.MutableRefObject<Map<string, HTMLDivElement>>,
) {
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null,
  );
  // Ref mirrors state so handlers always read the latest value synchronously
  // without stale-closure issues.
  const dropIndicatorRef = useRef<DropIndicator | null>(null);

  const setDropIndicatorBoth = useCallback((val: DropIndicator | null) => {
    dropIndicatorRef.current = val;
    setDropIndicator(val);
  }, []);

  const handleTabDragOver = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>) => {
      const el = tabRefs?.current.get(tabId);
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
    [onTabDragOver, setDropIndicatorBoth, tabRefs],
  );

  const handleTabDrop = useCallback(
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

  const handleTabDragEnd = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>) => {
      setDropIndicatorBoth(null);
      onTabDragEnd?.(tabId, event);
    },
    [onTabDragEnd, setDropIndicatorBoth],
  );

  return {
    dropIndicator,
    dropIndicatorRef,
    setDropIndicatorBoth,
    handleTabDragOver,
    handleTabDrop,
    handleTabDragEnd,
  };
}
