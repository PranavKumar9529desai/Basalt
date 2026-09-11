//! Minimal CodeMirror token styling mapped to the app's `--sat-editor-*` and
//! `--sat-syntax-*` theme tokens so the preview tracks the editor's prose +
//! code surface.

import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const highlightStyle = HighlightStyle.define([
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
