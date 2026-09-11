//! Search preview pane — instant lightweight preview during rapid arrow
//! navigation, switching to a full CodeMirror view once the result settles.
//!
//! Windowed parse keeps the synchronous O(doc) pass bounded around the match
//! line; the LRU cache avoids re-parsing unchanged files.

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import type { Highlight, PreviewDeps } from "../../types";
import { cachedPreviewState } from "./state";
import { windowPreview } from "./window";
import { buildDecorations, setMatchDeco } from "./decorations";
import { LightweightPreview } from "./LightweightPreview";

interface PreviewPaneProps {
  text: string;
  path: string;
  matchLine: number;
  highlights: Highlight[];
  deps: PreviewDeps;
}

/**
 * Lightweight instant preview rendered during rapid arrow navigation.
 * Keeps keystroke response locked at 60 FPS by bypassing heavy CM6 reading
 * extensions until the user pauses on a result.
 */
export function PreviewPane({
  text,
  path,
  matchLine,
  highlights,
  deps,
}: PreviewPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Rapid navigation debouncing: 80 ms of quiet after the last input before
  // the full CM6 view is swapped in.
  const [isSettled, setIsSettled] = useState(true);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastNavTimeRef = useRef<number>(0);

  useEffect(() => {
    const now = performance.now();
    const elapsed = now - lastNavTimeRef.current;
    lastNavTimeRef.current = now;

    if (elapsed < 80) {
      setIsSettled(false);
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        setIsSettled(true);
      }, 80);
    } else {
      setIsSettled(true);
    }

    return () => clearTimeout(settleTimerRef.current);
  }, [text, path, matchLine, highlights]);

  const windowed = useMemo(
    () => windowPreview(text, matchLine, highlights),
    [text, matchLine, highlights],
  );
  const winText = windowed.text;
  const winMatchLine = windowed.matchLine;
  const winHighlights = windowed.highlights;

  /** Content currently installed in `view` — ref compare beats a per-nav
   * `doc.toString()` on large files. */
  const currentTextRef = useRef(winText);
  /** Latest match offset to recenter on; coalesces rapid navigation. */
  const scrollTargetRef = useRef<number>(0);
  /** One pending recenter rAF at a time. */
  const scrollScheduledRef = useRef(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: cachedPreviewState(winText, path, deps),
    });
    viewRef.current = view;
    return () => view.destroy();
    // Create the EditorView once; subsequent updates are done via transactions
    // in the effect below so livePreviewPlugin updates incrementally instead of
    // re-instantiating extensions (which re-parsed the whole file and froze the
    // app on every keystroke / result navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSettled) return;
    const view = viewRef.current;
    if (!view) return;
    if (currentTextRef.current !== winText) {
      view.setState(cachedPreviewState(winText, path, deps));
      currentTextRef.current = winText;
    }
    const lineNo = Math.max(1, Math.min(winMatchLine, view.state.doc.lines));
    const pos = view.state.doc.line(lineNo).from;
    view.dispatch({
      effects: [
        setMatchDeco.of(
          buildDecorations(view.state.doc, winMatchLine, winHighlights),
        ),
      ],
    });

    // Skip the recenter when the match is already visible — scrollIntoView on
    // a large doc forces O(doc) line-measure. When it must jump, defer it to
    // the next frame so the keydown paints instantly; rapid navigation
    // coalesces into a single recenter (the last target wins).
    const visible = view.visibleRanges.some(
      (r) => pos >= r.from && pos <= r.to,
    );
    if (!visible) {
      scrollTargetRef.current = pos;
      if (scrollScheduledRef.current) return;
      scrollScheduledRef.current = true;
      requestAnimationFrame(() => {
        scrollScheduledRef.current = false;
        const v = viewRef.current;
        if (v !== view || !v.scrollDOM.isConnected) return;
        const target = scrollTargetRef.current;
        if (target <= 0 || !v.state.doc.length) return;
        v.dispatch({
          effects: [
            EditorView.scrollIntoView(Math.min(target, v.state.doc.length), {
              y: "center",
            }),
          ],
        });
      });
    }
  }, [isSettled, winText, path, winMatchLine, winHighlights, deps]);

  return (
    <div className="h-full w-full relative overflow-hidden">
      {!isSettled && (
        <LightweightPreview
          text={winText}
          matchLine={winMatchLine}
          highlights={winHighlights}
        />
      )}
      <div
        ref={hostRef}
        className="h-full w-full overflow-hidden"
        style={{ display: isSettled ? "block" : "none" }}
      />
    </div>
  );
}
// Re-export public internals for backward-compatible test imports.
export { buildDecorations } from "./decorations";
export { cachedPreviewState } from "./state";
export { windowPreview } from "./window";
export type { PreviewWindow } from "./window";
