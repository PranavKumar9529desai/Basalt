import {
  type ReactNode,
  Fragment,
  useCallback,
  useRef,
  useState,
} from "react";

export interface SplitPaneProps {
  orientation: "horizontal" | "vertical";
  children: ReactNode[];
  /** Initial sizes as fractions (default: equal distribution). */
  sizes?: number[];
}

const SASH_SIZE = 4; // px
const MIN_SIZE_PX = 100;

/**
 * Lightweight split pane with draggable sash dividers.
 * VS Code-style proportional resizing without the full SerializableGrid widget.
 */
export function SplitPane({
  orientation,
  children,
  sizes: initialSizes,
}: SplitPaneProps) {
  const count = Array.isArray(children) ? children.length : 1;
  const [sizes, setSizes] = useState<number[]>(() => {
    if (initialSizes && initialSizes.length === count) return initialSizes;
    return Array(count).fill(100 / count); // percentage-based
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const isVertical = orientation === "horizontal"; // "horizontal" = columns = flex-row

  const handleSashMouseDown = useCallback(
    (sashIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const axisSize = isVertical ? rect.width : rect.height;
      const startSizes = [...sizes];

      const onMove = (ev: MouseEvent) => {
        const pos = isVertical
          ? ev.clientX - rect.left
          : ev.clientY - rect.top;

        // Convert position to percentage
        const posPercent = (pos / axisSize) * 100;

        // Calculate cumulative positions of sashes
        let cumPercent = 0;
        for (let i = 0; i <= sashIndex; i++) {
          cumPercent += startSizes[i];
        }

        // The sash is between pane sashIndex and sashIndex+1
        const prevEnd = cumPercent;
        const nextEnd = cumPercent + startSizes[sashIndex + 1];

        // Clamp
        const clamped = Math.max(
          prevEnd - startSizes[sashIndex] + MIN_SIZE_PX / axisSize * 100,
          Math.min(nextEnd - MIN_SIZE_PX / axisSize * 100, posPercent),
        );

        const diff = clamped - prevEnd;

        const newSizes = [...startSizes];
        newSizes[sashIndex] += diff;
        newSizes[sashIndex + 1] -= diff;

        setSizes(newSizes);
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [isVertical, sizes],
  );

  const items = Array.isArray(children) ? children : [children];

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 min-w-0 flex-1"
      style={{
        flexDirection: isVertical ? "row" : "column",
      }}
    >
      {items.map((child, i) => (
        <Fragment key={`split-${i}`}>
          <div
            className="flex min-h-0 min-w-0 overflow-hidden"
            style={{
              flex: `${sizes[i]} 1 0%`,
            }}
          >
            {child}
          </div>
          {i < items.length - 1 && (
            <button
              type="button"
              aria-label="Resize pane"
              className="shrink-0 hover:bg-[var(--sat-accent-primary)] transition-colors border-0 p-0 bg-transparent"
              style={{
                width: isVertical ? SASH_SIZE : "100%",
                height: isVertical ? "100%" : SASH_SIZE,
                cursor: isVertical ? "col-resize" : "row-resize",
                background: "var(--sat-layout-border)",
              }}
              onMouseDown={(e) => handleSashMouseDown(i, e)}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}
