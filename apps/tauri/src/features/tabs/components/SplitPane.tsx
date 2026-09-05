import { type ReactNode, Fragment, useCallback, useRef } from "react";

export interface SplitPaneProps {
  orientation: "horizontal" | "vertical";
  children: ReactNode[];
  /** Child sizes as 0–1 fractions; `undefined` → equal distribution. */
  sizes?: (number | undefined)[];
  onResize: (sizes: number[]) => void;
}

const SASH_SIZE = 4; // px
const MIN_SIZE_PERCENT = 0.15; // 15% — never let a pane collapse to nothing

/**
 * Controlled split pane (ADR-032 Phase 6). Sizes live in the layout tree and
 * are persisted with the workspace snapshot; dragging a sash normalizes to
 * fractions that sum to 1 and writes them back via `onResize`.
 */
export function SplitPane({
  orientation,
  children,
  sizes,
  onResize,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const items = Array.isArray(children) ? children : [children];
  const count = items.length;

  // Equal share fallback for children that don't carry a size.
  const sizeAt = useCallback(
    (i: number): number => {
      const explicit = sizes?.[i];
      return typeof explicit === "number" && Number.isFinite(explicit)
        ? explicit
        : 1 / count;
    },
    [sizes, count],
  );
  const current = Array.from({ length: count }, (_, i) => sizeAt(i));

  const isVertical = orientation === "horizontal"; // "horizontal" = columns = flex-row

  const handleSashMouseDown = useCallback(
    (sashIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const axisSize = isVertical ? rect.width : rect.height;
      const startSizes = [...current];

      const onMove = (ev: MouseEvent) => {
        const pos = isVertical
          ? ev.clientX - rect.left
          : ev.clientY - rect.top;
        const posFrac = axisSize > 0 ? pos / axisSize : 0;

        // Sash position = cumulative width before the sash + diff. Restrict
        // both sides to MIN_SIZE_PERCENT so a pane can never collapse.
        let prevEnd = 0;
        for (let i = 0; i <= sashIndex; i++) prevEnd += startSizes[i];
        const lo = prevEnd - startSizes[sashIndex] + MIN_SIZE_PERCENT;
        const hi =
          prevEnd + startSizes[sashIndex + 1] - MIN_SIZE_PERCENT;
        const sashPos = Math.max(lo, Math.min(hi, posFrac));

        const diff = sashPos - prevEnd;
        const newSizes = [...startSizes];
        newSizes[sashIndex] += diff;
        newSizes[sashIndex + 1] -= diff;

        onResize(newSizes);
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [isVertical, onResize, current],
  );

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 min-w-0 flex-1"
      style={{ flexDirection: isVertical ? "row" : "column" }}
    >
      {items.map((child, i) => {
        const raw = sizeAt(i);
        const share = (raw / current.reduce((s, n) => s + n, 0)) * 100;
        return (
          <Fragment key={`split-${i}`}>
            <div
              className="flex min-h-0 min-w-0 overflow-hidden"
              style={{ flex: `${share} 1 0%` }}
            >
              {child}
            </div>
            {i < items.length - 1 && (
              <button
                type="button"
                aria-label="Resize pane"
                className="group relative shrink-0 border-0 bg-transparent p-0"
                style={{
                  width: isVertical ? SASH_SIZE : "100%",
                  height: isVertical ? "100%" : SASH_SIZE,
                  cursor: isVertical ? "col-resize" : "row-resize",
                }}
                onMouseDown={(e) => handleSashMouseDown(i, e)}
              >
                {/* 1px hairline — visually identical to the shell's
                    <HeaderBandRule> (h-px bg-[var(--sat-layout-border)]), so
                    every pane border reads as one continuous line. Accent on
                    hover keeps the lean sash grabbable. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bg-[var(--sat-layout-border)] transition-colors group-hover:bg-[var(--sat-accent-primary)]"
                  style={
                    isVertical
                      ? {
                          left: "50%",
                          top: 0,
                          width: 1,
                          height: "100%",
                          transform: "translateX(-50%)",
                        }
                      : {
                          top: "50%",
                          left: 0,
                          height: 1,
                          width: "100%",
                          transform: "translateY(-50%)",
                        }
                  }
                />
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}