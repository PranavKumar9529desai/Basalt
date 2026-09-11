//! Lightweight instant preview — renders raw text with inline mark spans
//! during rapid arrow navigation (debounced 80 ms by the parent). Keeps
//! keystroke response at 60 FPS by bypassing heavy CM6 reading extensions
//! until the user pauses on a result.

import { useEffect, useMemo, useRef } from "react";
import type { Highlight } from "../../types";

export function LightweightPreview({
  text,
  matchLine,
  highlights,
}: {
  text: string;
  matchLine: number;
  highlights: Highlight[];
}) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const matchEl = containerRef.current.querySelector<HTMLElement>(
      "[data-match-line='true']",
    );
    if (matchEl) {
      matchEl.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }, [matchLine]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-y-auto font-mono text-[11px] leading-[1.42] p-[12px_14px_16px] select-none text-[var(--sat-text-primary)]"
      style={{ fontFamily: "var(--sat-font-mono, monospace)" }}
    >
      {lines.map((lineStr, idx) => {
        const lineNo = idx + 1;
        const isMatch = lineNo === matchLine;

        if (!isMatch) {
          return (
            <div key={lineNo} className="flex min-w-0">
              <span className="w-10 pr-3 text-right text-[var(--sat-text-muted)] shrink-0 select-none opacity-50">
                {lineNo}
              </span>
              <span className="whitespace-pre flex-1 min-w-0">
                {lineStr || " "}
              </span>
            </div>
          );
        }

        const spans: React.ReactNode[] = [];
        let from = 0;
        const sortedHl = [...highlights].sort((a, b) => a.start - b.start);
        for (const h of sortedHl) {
          if (h.start > from) {
            spans.push(lineStr.slice(from, h.start));
          }
          spans.push(
            <mark
              key={`${h.start}-${h.end}`}
              style={{
                background: "var(--sat-accent-primary)",
                color: "var(--sat-text-inverse)",
                borderRadius: "2px",
              }}
            >
              {lineStr.slice(h.start, h.end)}
            </mark>,
          );
          from = h.end;
        }
        if (from < lineStr.length) {
          spans.push(lineStr.slice(from));
        }

        return (
          <div
            key={lineNo}
            data-match-line="true"
            className="flex min-w-0 rounded"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--sat-accent-primary) 12%, transparent)",
            }}
          >
            <span className="w-10 pr-3 text-right text-[var(--sat-accent-primary)] font-bold shrink-0 select-none">
              {lineNo}
            </span>
            <span className="whitespace-pre flex-1 min-w-0 font-medium">
              {spans.length > 0 ? spans : lineStr || " "}
            </span>
          </div>
        );
      })}
    </div>
  );
}
