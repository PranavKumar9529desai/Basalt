import { useEffect, useState } from "react";

/**
 * Observes size changes of a DOM element using ResizeObserver.
 * Returns the element's current content rect (width, height).
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const rect = useResizeObserver(ref);
 * return <div ref={ref}>Width: {rect?.width}px</div>;
 * ```
 */
export function useResizeObserver(
  ref: React.RefObject<HTMLElement | null>,
): DOMRectReadOnly | null {
  const [rect, setRect] = useState<DOMRectReadOnly | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRect(entry.contentRect);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return rect;
}
