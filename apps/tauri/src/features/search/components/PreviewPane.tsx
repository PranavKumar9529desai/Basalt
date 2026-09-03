import { useEffect, useMemo, useRef } from "react";
import {
  EditorState,
  Extension,
  Range,
  StateEffect,
  StateField,
  Text,
} from "@codemirror/state";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";
import { readingExtensions } from "@workspace/editor";
import type { Highlight, PreviewDeps } from "../types";

// Minimal token styling mapped to the app's --sat-editor-* and --sat-syntax-*
// theme tokens so the preview tracks the editor's prose + code surface.
const highlightStyle = HighlightStyle.define([
  {
    tag: t.heading1,
    color: "var(--sat-editor-heading1)",
    fontWeight: "700",
    fontSize: "1.55em",
  },
  {
    tag: t.heading2,
    color: "var(--sat-editor-heading2)",
    fontWeight: "700",
    fontSize: "1.32em",
  },
  {
    tag: t.heading3,
    color: "var(--sat-editor-heading3)",
    fontWeight: "600",
    fontSize: "1.16em",
  },
  {
    tag: t.heading4,
    color: "var(--sat-editor-heading4)",
    fontWeight: "600",
    fontSize: "1.06em",
  },
  {
    tag: t.heading5,
    color: "var(--sat-editor-heading5)",
    fontWeight: "600",
    fontSize: "0.98em",
  },
  {
    tag: t.heading6,
    color: "var(--sat-editor-heading6)",
    fontWeight: "600",
    fontSize: "0.93em",
  },
  { tag: t.keyword, color: "var(--sat-syntax-keyword)" },
  { tag: t.string, color: "var(--sat-syntax-string)" },
  { tag: t.comment, color: "var(--sat-syntax-comment)", fontStyle: "italic" },
  { tag: t.number, color: "var(--sat-syntax-number)" },
  { tag: t.link, color: "var(--sat-syntax-link)", textDecoration: "underline" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.monospace, fontFamily: "var(--sat-font-mono, monospace)" },
]);

function languageForPath(path: string, deps: PreviewDeps): Extension {
  if (path.endsWith(".md")) {
    return readingExtensions(deps);
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const desc = languages.find(
    (l) => l.alias?.includes(ext) || (l.filename?.test(path) ?? false),
  );
  return (desc ? desc.support : []) as Extension;
}

export function buildDecorations(
  doc: Text,
  matchLine: number,
  highlights: Highlight[],
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const lineNo = Math.max(1, Math.min(matchLine, doc.lines));
  const line = doc.line(lineNo);
  ranges.push(
    Decoration.line({
      attributes: {
        style:
          "background: color-mix(in srgb, var(--sat-accent-primary) 12%, transparent);",
      },
    }).range(line.from),
  );
  for (const h of [...highlights].sort((a, b) => a.start - b.start)) {
    const from = line.from + h.start;
    const to = line.from + h.end;
    if (from >= line.from && to <= line.to && from < to) {
      ranges.push(
        Decoration.mark({
          attributes: {
            style:
              "background: var(--sat-accent-primary); color: var(--sat-text-inverse); border-radius: 2px;",
          },
        }).range(from, to),
      );
    }
  }
  return Decoration.set(ranges);
}

const setMatchDeco = StateEffect.define<DecorationSet>();

const matchDecoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    if (tr.docChanged) return value.map(tr.changes.desc);
    for (const e of tr.effects) {
      if (e.is(setMatchDeco)) return e.value;
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Bounded window of a preview document.
 *
 * The search preview feeds an *entire* file into CodeMirror, which parses and
 * decorates the whole doc synchronously on the WebCore main thread. On large
 * files (huge notes) that O(doc) parse runs on every result navigation and —
 * combined with the live-preview scheduler + scroll-triggered renders — spins
 * the main thread past WebKitGTK's 10s watchdog, which aborts the web process
 * (`crashAfter10Seconds`). Capping the preview to a window of lines *around
 * the match* bounds the parse to a handful of KB regardless of file size.
 */
export interface PreviewWindow {
  text: string;
  matchLine: number;
  highlights: Highlight[];
}

const PREVIEW_WINDOW_LINES_BEFORE = 200;
const PREVIEW_WINDOW_LINES_AFTER = 200;

export function windowPreview(
  text: string,
  matchLine: number,
  highlights: Highlight[],
): PreviewWindow {
  const beforeLine = Math.max(1, matchLine - PREVIEW_WINDOW_LINES_BEFORE);
  const afterLine = matchLine + PREVIEW_WINDOW_LINES_AFTER;
  let line = 1;
  let lineStart = 0;
  let start = 0;
  let end = text.length;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text.charCodeAt(i) !== 10) continue;
    if (line === beforeLine) start = lineStart;
    if (line === afterLine) {
      end = i;
      break;
    }
    lineStart = i + 1;
    line += 1;
  }
  // The match line's *content* is unchanged by the slice, so line-relative
  // highlight offsets stay valid; only the line number shifts.
  const newMatchLine = matchLine - beforeLine + 1;
  return { text: text.slice(start, end), matchLine: newMatchLine, highlights };
}

function makeState(text: string, path: string, deps: PreviewDeps): EditorState {
  return EditorState.create({
    doc: text,
    extensions: [
      languageForPath(path, deps),
      syntaxHighlighting(highlightStyle),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme(
        {
          "&": { height: "100%", backgroundColor: "transparent" },
          ".cm-content": {
            padding: "12px 14px 16px",
          },
          ".cm-scroller": {
            fontFamily: "var(--sat-font-mono, monospace)",
            fontSize: "11px",
            lineHeight: "1.42",
          },
          ".cm-gutters": {
            backgroundColor: "transparent",
            border: "none",
            color: "var(--sat-text-muted)",
          },
        },
        { dark: true },
      ),
      matchDecoField,
    ],
  });
}

/**
 * Module-level LRU of parsed preview states, keyed by path and file content — the
 * EditorView per-tab cache pattern, but surviving modal mounts. Parsing a
 * large file is the dominant preview cost (open-cold, cross-file nav); the
 * parse is correct to reuse because a hit requires the identical content
 * string, so a changed file is always re-parsed.
 */
const parseCacheLimit = 24;
const parseCache = new Map<string, EditorState>();

export function cachedPreviewState(
  text: string,
  path: string,
  deps: PreviewDeps,
): EditorState {
  const cacheKey = `${path}\0${text}`;
  const hit = parseCache.get(cacheKey);
  if (hit) {
    parseCache.delete(cacheKey);
    parseCache.set(cacheKey, hit);
    return hit;
  }
  const state = makeState(text, path, deps);
  if (parseCache.size >= parseCacheLimit) {
    parseCache.delete(parseCache.keys().next().value as string);
  }
  parseCache.set(cacheKey, state);
  return state;
}

interface PreviewPaneProps {
  text: string;
  path: string;
  matchLine: number;
  highlights: Highlight[];
  deps: PreviewDeps;
}

export function PreviewPane({
  text,
  path,
  matchLine,
  highlights,
  deps,
}: PreviewPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Bound the document handed to CodeMirror to a window around the match line.
  // Keeps the synchronous parse + decoration walk O(window) so a huge file
  // can never spin the WebCore main thread past WebKitGTK's 10s watchdog.
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
    const view = viewRef.current;
    if (!view) return;
    // Swap the document only when the content changed. Parsed states come from
    // the module-level LRU cache, so revisiting a file never re-parses;
    // navigating results within the same file skips this entirely.
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
  }, [winText, path, winMatchLine, winHighlights, deps]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />;
}
