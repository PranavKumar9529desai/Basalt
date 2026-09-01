import { closeBrackets } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Table } from "@lezer/markdown";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { backticksKeymap } from "./input/backticks";
import { pasteImageExtension } from "./input/paste-image";
import { embedPreviewPlugin, EMBED_PREVIEW_THEME } from "./input/embed-preview";
import {
  createSuggestionsPlugin,
  SUGGESTIONS_THEME,
} from "./input/suggestions";
import { TASK_CHECKBOX_THEME, taskListPlugin } from "./input/task-list";
import { LIVE_PREVIEW_THEME, livePreviewPlugin } from "./preview/live-preview";
import { BASE_EDITOR_THEME } from "./styling/base";
import { codeSyntaxHighlightingExtension } from "./syntax/code-highlight-style";
import { yamlFrontmatterExtension } from "./syntax/frontmatter";
import { highlightExtension } from "./syntax/highlight";
import { clickableLinksPlugin, wikiLinkExtension } from "./syntax/wiki-links";
import {
  frontmatterBlockWidgetGroup,
  frontmatterDimMode,
} from "./block-widgets/frontmatter";
import { htmlBlockSpec, HTML_BLOCK_THEME, ensureTypographyStyle } from "./block-widgets/html-block";
import { dqlBlockSpec, DQL_WIDGET_THEME, openLinkFacet, runQueryFacet } from "./block-widgets/dql-widget";
import { tableBlockSpec, TABLE_BLOCK_THEME } from "./block-widgets/table-widget";
import {
  blockWidgetSpecsFacet,
  type BlockWidgetSpec,
} from "./block-widgets/registry";
import type { EditorConfig } from "./types";
const basaltMarkdownExtensions = [
  wikiLinkExtension,
  highlightExtension,
  yamlFrontmatterExtension,
  Table,
];



/**
 * Editor extensions grouped by concern, so the benchmark harness can run
 * against subsets (extension isolation mode) and attribute per-keystroke
 * cost to a specific group.
 */
export interface EditorExtensionGroups {
  /** Irreducible floor: markdown language + grammar extensions + theme + wrapping. */
  base: Extension[];
  /** Code block syntax highlighting. */
  syntax: Extension[];
  /** Typing helpers: task checkboxes, close brackets, backticks keymap. */
  input: Extension[];
  /** Live-preview mark hiding (headings, bold, …). */
  livePreview: Extension[];
  /** Wikilink/tag autocomplete suggestions. */
  suggestions: Extension[];
  /** Clickable link hover/click handling. */
  links: Extension[];
  /** Block widgets (ADR-022 rule 14): the inline Properties panel et al. Rendered
   * from live-preview's single walk; this group supplies specs + injected deps. */
  blockWidgets: Extension[];
}

export function createEditorExtensionGroups(
  config: EditorConfig,
): EditorExtensionGroups {
  const {
    onFetchLinks,
    onFetchTags,
    onOpenLink,
    themeExtensions,
    includeDefaultTheme = true,
  } = config;
  // Inject HTML typography CSS (.sat-html + .cm-content) once per editor creation.
  // Covers both block widgets and inline HTML elements rendered by the browser.
  ensureTypographyStyle();

  const themeStack: Extension[] = [];
  if (themeExtensions) themeStack.push(...themeExtensions);
  if (includeDefaultTheme) {
    themeStack.push(BASE_EDITOR_THEME);
  }

  return {
    base: [
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: basaltMarkdownExtensions,
      }),
      ...themeStack,
      EditorView.lineWrapping,
    ],
    syntax: [codeSyntaxHighlightingExtension()],
    input: [
      TASK_CHECKBOX_THEME,
      taskListPlugin,
      closeBrackets(),
      keymap.of(backticksKeymap),
      pasteImageExtension(config.onPasteImage),
    ],
    livePreview: [LIVE_PREVIEW_THEME, livePreviewPlugin, EMBED_PREVIEW_THEME, embedPreviewPlugin],
    suggestions: [
      SUGGESTIONS_THEME,
      createSuggestionsPlugin(onFetchLinks, onFetchTags),
    ],
    links: [clickableLinksPlugin(onOpenLink)],
    blockWidgets: [
      ...frontmatterBlockWidgetGroup({
        parseFrontmatter: config.parseFrontmatter,
        editFrontmatter: config.editFrontmatter,
        onFetchTags: onFetchTags,
        onFetchLinks: onFetchLinks,
      }),
      // Sanitized HTML block widget + its theme.
      blockWidgetSpecsFacet.of(htmlBlockSpec as BlockWidgetSpec),
      HTML_BLOCK_THEME,
      // Table block widget — renders markdown tables as rich <table> HTML.
      blockWidgetSpecsFacet.of(tableBlockSpec as BlockWidgetSpec),
      TABLE_BLOCK_THEME,
      // DQL query block widget — renders ```dql code blocks as live table/list/task views.
      blockWidgetSpecsFacet.of(dqlBlockSpec as BlockWidgetSpec),
      DQL_WIDGET_THEME,
      runQueryFacet.of(config.runQuery),
      openLinkFacet.of(config.onOpenLink),
    ],
  };
}

/**
 * The full production extension stack. Order here is behavior — groups are
 * composed in the same order the monolithic list used to be.
 */
export function createEditorExtensions(config: EditorConfig): Extension[] {
  const g = createEditorExtensionGroups(config);
  return [
    ...g.base,
    ...g.syntax,
    ...g.input,
    ...g.livePreview,
    ...g.suggestions,
    ...g.links,
    ...g.blockWidgets,
  ];
}
/**
 * Markdown extensions for a read-only preview pane (search results, etc.).
 * Mirrors the `base` group's grammar without the interactive editor extras.
 * Registers the frontmatter block widget in read-only "dim" mode, so previews
 * keep the tinted-YAML presentation without a parser or an interactive panel.
 */
export function previewExtensions(): Extension[] {
  return [
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      extensions: basaltMarkdownExtensions,
    }),
    codeSyntaxHighlightingExtension(),
    ...LIVE_PREVIEW_THEME,
    ...livePreviewPlugin,
    // Dim-mode frontmatter only: no parser, no interactive panel.
    ...frontmatterBlockWidgetGroup({}),
    frontmatterDimMode,
    // Sanitized HTML blocks render in read-only previews too.
    blockWidgetSpecsFacet.of(htmlBlockSpec as BlockWidgetSpec),
    HTML_BLOCK_THEME,
    // Table block widget renders in read-only previews too.
    blockWidgetSpecsFacet.of(tableBlockSpec as BlockWidgetSpec),
    TABLE_BLOCK_THEME,
    EditorView.lineWrapping,
  ];
}
