import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// ---------------------------------------------------------------------------
// CSS theme — syntax token colours via --sat-syntax-* CSS custom properties.
// Define these variables in your theme root and they'll cascade here.
// ---------------------------------------------------------------------------

export const CODE_HIGHLIGHT_THEME = EditorView.theme({
  /** Keywords: if, else, for, while, return, import, class, etc. */
  "& .cm-line.cm-live-code .sat-syntax-keyword": {
    color: "var(--sat-syntax-keyword, #c678dd)",
  },
  /** Strings (single/double quoted, template literals) */
  "& .cm-line.cm-live-code .sat-syntax-string": {
    color: "var(--sat-syntax-string, #98c379)",
  },
  /** Numbers (integers, floats) */
  "& .cm-line.cm-live-code .sat-syntax-number": {
    color: "var(--sat-syntax-number, #d19a66)",
  },
  /** Comments (//, /*, #, etc.) */
  "& .cm-line.cm-live-code .sat-syntax-comment": {
    color: "var(--sat-syntax-comment, #5c6370)",
    fontStyle: "italic",
  },
  /** Function / method names */
  "& .cm-line.cm-live-code .sat-syntax-function": {
    color: "var(--sat-syntax-function, #61afef)",
  },
  /** Type names / classes */
  "& .cm-line.cm-live-code .sat-syntax-type": {
    color: "var(--sat-syntax-type, #e5c07b)",
  },
  /** Variable names */
  "& .cm-line.cm-live-code .sat-syntax-variable": {
    color: "var(--sat-syntax-variable, #e06c75)",
  },
  /** Boolean, null, undefined */
  "& .cm-line.cm-live-code .sat-syntax-atom": {
    color: "var(--sat-syntax-atom, #d19a66)",
  },
  /** Operators (+, -, *, /, &&, ||, etc.) */
  "& .cm-line.cm-live-code .sat-syntax-operator": {
    color: "var(--sat-syntax-operator, #abb2bf)",
  },
  /** Property / attribute names */
  "& .cm-line.cm-live-code .sat-syntax-property": {
    color: "var(--sat-syntax-property, #e06c75)",
  },
  /** Tag names (HTML/JSX/XML) */
  "& .cm-line.cm-live-code .sat-syntax-tag": {
    color: "var(--sat-syntax-tag, #e06c75)",
  },
  /** Attribute names (HTML/JSX/XML) */
  "& .cm-line.cm-live-code .sat-syntax-attribute": {
    color: "var(--sat-syntax-attribute, #d19a66)",
  },
  /** Punctuation / brackets / parens */
  "& .cm-line.cm-live-code .sat-syntax-punctuation": {
    color: "var(--sat-syntax-punctuation, #abb2bf)",
  },
  /** Regex literals */
  "& .cm-line.cm-live-code .sat-syntax-regexp": {
    color: "var(--sat-syntax-regexp, #98c379)",
  },
  /** Doc comments / JSDoc / Javadoc */
  "& .cm-line.cm-live-code .sat-syntax-doc": {
    color: "var(--sat-syntax-doc, #5c6370)",
    fontStyle: "italic",
  },
  /** Macros / preprocessor directives */
  "& .cm-line.cm-live-code .sat-syntax-macro": {
    color: "var(--sat-syntax-macro, #c678dd)",
  },
  /** Meta / preprocessor */
  "& .cm-line.cm-live-code .sat-syntax-meta": {
    color: "var(--sat-syntax-meta, #5c6370)",
  },
  /** Changed / deleted / inserted (diff highlighting) */
  "& .cm-line.cm-live-code .sat-syntax-changed": {
    color: "var(--sat-syntax-changed, #e5c07b)",
  },
  "& .cm-line.cm-live-code .sat-syntax-deleted": {
    color: "var(--sat-syntax-deleted, #e06c75)",
  },
  "& .cm-line.cm-live-code .sat-syntax-inserted": {
    color: "var(--sat-syntax-inserted, #98c379)",
  },
  /** Link / URL */
  "& .cm-line.cm-live-code .sat-syntax-link": {
    color: "var(--sat-syntax-link, #61afef)",
    textDecoration: "underline",
  },
});

// ---------------------------------------------------------------------------
// HighlightStyle — maps Lezer syntax tags → CSS class names
// ---------------------------------------------------------------------------

/**
 * A class-based syntax highlighter for code blocks within the editor.
 * Instead of inlining colour values, we emit CSS class names that are
 * styled via the companion CODE_HIGHLIGHT_THEME above.
 *
 * This lets the theme system (CSS custom properties) control colours
 * without recompiling the HighlightStyle.
 *
 * Only code-specific tags are mapped — markdown-only tags (heading, emphasis,
 * strong, strikethrough, monospace, content, list, quote, labelName) are
 * intentionally excluded so `.sat-syntax-*` classes are never emitted by
 * the markdown parser.
 */
const codeSyntaxHighlighter = HighlightStyle.define([
  { tag: t.keyword, class: "sat-syntax-keyword" },
  { tag: t.string, class: "sat-syntax-string" },
  { tag: t.docString, class: "sat-syntax-string" },
  { tag: t.character, class: "sat-syntax-string" },
  { tag: t.number, class: "sat-syntax-number" },
  { tag: t.integer, class: "sat-syntax-number" },
  { tag: t.float, class: "sat-syntax-number" },
  { tag: t.comment, class: "sat-syntax-comment" },
  { tag: t.lineComment, class: "sat-syntax-comment" },
  { tag: t.blockComment, class: "sat-syntax-comment" },
  { tag: t.docComment, class: "sat-syntax-doc" },
  { tag: t.function(t.variableName), class: "sat-syntax-function" },
  {
    tag: t.definition(t.function(t.variableName)),
    class: "sat-syntax-function",
  },
  { tag: t.typeName, class: "sat-syntax-type" },
  { tag: t.className, class: "sat-syntax-type" },
  { tag: t.variableName, class: "sat-syntax-variable" },
  { tag: t.self, class: "sat-syntax-keyword" },
  { tag: t.atom, class: "sat-syntax-atom" },
  { tag: t.bool, class: "sat-syntax-atom" },
  { tag: t.null, class: "sat-syntax-atom" },
  { tag: t.operator, class: "sat-syntax-operator" },
  { tag: t.operatorKeyword, class: "sat-syntax-keyword" },
  { tag: t.controlKeyword, class: "sat-syntax-keyword" },
  { tag: t.definitionKeyword, class: "sat-syntax-keyword" },
  { tag: t.moduleKeyword, class: "sat-syntax-keyword" },
  { tag: t.propertyName, class: "sat-syntax-property" },
  { tag: t.tagName, class: "sat-syntax-tag" },
  { tag: t.attributeName, class: "sat-syntax-attribute" },
  { tag: t.attributeValue, class: "sat-syntax-string" },
  { tag: t.punctuation, class: "sat-syntax-punctuation" },
  { tag: t.separator, class: "sat-syntax-punctuation" },
  { tag: t.bracket, class: "sat-syntax-punctuation" },
  { tag: t.paren, class: "sat-syntax-punctuation" },
  { tag: t.brace, class: "sat-syntax-punctuation" },
  { tag: t.regexp, class: "sat-syntax-regexp" },
  { tag: t.escape, class: "sat-syntax-string" },
  { tag: t.link, class: "sat-syntax-link" },
  { tag: t.macroName, class: "sat-syntax-macro" },
  { tag: t.meta, class: "sat-syntax-meta" },
  { tag: t.annotation, class: "sat-syntax-meta" },
  { tag: t.processingInstruction, class: "sat-syntax-comment" },
  { tag: t.changed, class: "sat-syntax-changed" },
  { tag: t.deleted, class: "sat-syntax-deleted" },
  { tag: t.inserted, class: "sat-syntax-inserted" },
  { tag: t.invalid, class: "sat-syntax-meta" },
  { tag: t.unit, class: "sat-syntax-number" },
  { tag: t.url, class: "sat-syntax-link" },
  { tag: t.namespace, class: "sat-syntax-type" },
  { tag: t.modifier, class: "sat-syntax-keyword" },
  { tag: t.color, class: "sat-syntax-atom" },
]);

// ---------------------------------------------------------------------------
// Public extension
// ---------------------------------------------------------------------------

/**
 * CodeMirror extension that provides dark-theme-optimised syntax
 * highlighting for code blocks.  Uses CSS class names (styled via
 * `--sat-syntax-*` custom properties) so colours are fully themeable.
 *
 * Include this in your editor extension stack. Because only code-specific
 * tags are mapped, the highlighter naturally only affects fenced code blocks
 * with a recognised programming language.
 */
export function codeSyntaxHighlightingExtension(): Extension {
  return [CODE_HIGHLIGHT_THEME, syntaxHighlighting(codeSyntaxHighlighter)];
}
