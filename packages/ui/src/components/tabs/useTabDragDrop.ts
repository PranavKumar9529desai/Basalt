import { useCallback, useRef, useState } from "react";
import type { DragEvent, RefObject } from "react";

export interface DropIndicator {
  tabId: string;
  edge: "left" | "right";
}

/**
 * useTabDragDrop — owns the drop indicator state used by the tab strip's
 * drag-and-drop. Computes the insertion edge from the pointer's horizontal
 * half of the target tab and reports it to the external drop handler.
 */
export function useTabDragDrop(
  tabRefs: RefObject<Map<string, HTMLDivElement>>,
  onTabDragOver?: (tabId: string, event: DragEvent<HTMLElement>) => void,
  onTabDrop?: (
    tabId: string,
    event: DragEvent<HTMLElement>,
    edge: "left" | "right",
  ) => void,
  onTabDragEnd?: (tabId: string, event: DragEvent<HTMLElement>) => void,
) {
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const dropIndicatorRef = useRef<DropIndicator | null>(null);

  const setDropIndicatorBoth = useCallback(
    (val: DropIndicator | null) => {
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
            dropIndicatorRef.current?.edge === edge
            ? dropIndicatorRef.current
            : { tabId, edge },
        );
      }
      onTabDragOver?.(tabId, event);
    },
    [onTabDragOver, setDropIndicatorBoth, tabRefs],
  );

  const handleInternalDrop = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>) => {
      const indicator = dropIndicatorRef.current;
      setDropIndicatorBoth(null);
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

  return {
    dropIndicator,
    dropIndicatorRef,
    setDropIndicatorBoth,
    handleInternalDragOver,
    handleInternalDrop,
    handleInternalDragEnd,
  };
}
