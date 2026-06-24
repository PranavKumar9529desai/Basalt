import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Use this to override default syntax highlighting of CodeMirror.
 * For example, preventing default underlines on headings.
 *
 * Add more tag overrides here as needed — this file is the single
 * place to tweak CodeMirror's built-in highlighting behaviour.
 */
export const defaultHighlightStyleOverride = HighlightStyle.define([
  { tag: t.heading, textDecoration: "none" },
]);
