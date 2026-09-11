//! Preview EditorState construction + the module-level LRU of parsed states.
//! A hit requires the identical content string, so a changed file is always
//! re-parsed; revisiting a file (or navigating results within it) never is.

import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { languages } from "@codemirror/language-data";
import { readingExtensions } from "@workspace/editor";
import { extensionOf, isMarkdownPath } from "@workspace/ui";
import type { PreviewDeps } from "../../types";
import { highlightStyle } from "./theme";
import { matchDecoField } from "./decorations";
import { syntaxHighlighting } from "@codemirror/language";

export function languageForPath(path: string, deps: PreviewDeps): Extension {
  if (isMarkdownPath(path)) {
    return readingExtensions(deps);
  }
  const ext = extensionOf(path);
  const desc = languages.find(
    (l) => l.alias?.includes(ext) || (l.filename?.test(path) ?? false),
  );
  return (desc ? desc.support : []) as Extension;
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

const parseCacheLimit = 24;
const parseCache = new Map<string, EditorState>();

/**
 * Get a parsed preview state for `text`, reusing one from the LRU when the
 * content string matches (parse is the dominant preview cost — open-cold,
 * cross-file nav; the cache survives modal mounts).
 */
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