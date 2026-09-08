import { closeBrackets } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { backticksKeymap } from "./input/backticks";
import { tableNavigationKeymap } from "./input/table-navigation";
import { tableCursorExtension } from "./input/table-cursor";
import { pasteImageExtension } from "./input/paste-image";
import { embedMediaPlugin, EMBED_MEDIA_THEME } from "./input/embed-media";
import {
  createSuggestionsPlugin,
  SUGGESTIONS_THEME,
} from "./input/suggestions";
import { TASK_CHECKBOX_THEME, taskListPlugin } from "./input/task-list";
import { LIVE_PREVIEW_THEME, livePreviewPlugin } from "./preview/live-preview";
import { BASE_EDITOR_THEME } from "./styling/base";
import { codeSyntaxHighlightingExtension } from "./syntax/code-highlight-style";
import { clickableLinksPlugin } from "./syntax/wiki-links";
import { createBasaltGrammar } from "./syntax/registry";
import {
  frontmatterBlockWidgetGroup,
  frontmatterDimMode,
} from "./block-widgets/frontmatter";
import {
  htmlBlockSpec,
  HTML_BLOCK_THEME,
  ensureTypographyStyle,
} from "./block-widgets/html-block";
import {
  dqlBlockSpec,
  DQL_WIDGET_THEME,
  openLinkFacet,
  runQueryFacet,
} from "./block-widgets/dql-widget";
import {
  tableBlockSpec,
  TABLE_BLOCK_THEME,
} from "./block-widgets/table-widget";
import {
  mermaidBlockSpec,
  defaultMermaidTheme,
} from "./block-widgets/mermaid-widget";
import { MERMAID_WIDGET_THEME } from "./block-widgets/mermaid-theme";
import { mathBlockSpec } from "./block-widgets/math-widget";
import { MATH_WIDGET_THEME } from "./block-widgets/math-theme";
import { tableRawModeField } from "./block-widgets/table-state";
import { CODE_TOGGLE_BUTTON_THEME } from "./block-widgets/code-toggle-button";
import { embedRawModeField } from "./input/embed-state";
import {
  blockWidgetSpecsFacet,
  type BlockWidgetSpec,
} from "./block-widgets/registry";
import type { EditorConfig } from "./types";
import { openExternalLinkFacet, resolveAssetFacet } from "./types";
import { renderModeReading } from "./preview/render-mode";
import { readingLinkHandler } from "./links";

/** The ONE grammar list for the editor (ADR-033) — folded from the syntax
 * registry's manifests. Consumed by edit, reading, and preview surfaces. */
const basaltMarkdownExtensions = createBasaltGrammar();

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

/**
 * Shared registration for the HTML/table/DQL block widgets plus their themes.
 * Each block widget registers a spec (via `blockWidgetSpecsFacet.of`) and a
 * base theme. When a `runQuery`/`onOpenLink` config is supplied, the DQL widget
 * and the dependency facets are included (skip for read-only preview panes).
 */
function commonBlockWidgetExtensions(config?: {
  runQuery?: EditorConfig["runQuery"];
  onOpenLink?: EditorConfig["onOpenLink"];
}): Extension[] {
  const exts: Extension[] = [
    // Sanitized HTML block widget + its theme.
    blockWidgetSpecsFacet.of(htmlBlockSpec as BlockWidgetSpec),
    HTML_BLOCK_THEME,
    // Table block widget — renders markdown tables as rich <table> HTML.
    blockWidgetSpecsFacet.of(tableBlockSpec as BlockWidgetSpec),
    TABLE_BLOCK_THEME,
    tableRawModeField,
    embedRawModeField,
    CODE_TOGGLE_BUTTON_THEME,
    // Mermaid diagram block widget + theme + default dark theme facet
    blockWidgetSpecsFacet.of(mermaidBlockSpec as BlockWidgetSpec),
    MERMAID_WIDGET_THEME,
    defaultMermaidTheme,
    // Math (KaTeX) block widget + theme
    blockWidgetSpecsFacet.of(mathBlockSpec as BlockWidgetSpec),
    MATH_WIDGET_THEME,
  ];
  if (config?.runQuery || config?.onOpenLink) {
    // DQL query block widget — renders ```dql code blocks as live table/list/task views.
    exts.push(
      blockWidgetSpecsFacet.of(dqlBlockSpec as BlockWidgetSpec),
      DQL_WIDGET_THEME,
    );
    exts.push(runQueryFacet.of(config.runQuery));
    exts.push(openLinkFacet.of(config.onOpenLink));
  }
  return exts;
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
      keymap.of(tableNavigationKeymap),
      pasteImageExtension(config.onPasteImage),
      ...(config.onTableCursorChange
        ? [tableCursorExtension(config.onTableCursorChange)]
        : []),
    ],
    livePreview: [
      LIVE_PREVIEW_THEME,
      EMBED_MEDIA_THEME,
      livePreviewPlugin,
      // Live-preview embeds resolve to real media off the caret's line
      // (ADR-034 part C); the reading-mode path re-feeds this inside
      // the mode compartment.
      resolveAssetFacet.of(config.resolveAsset),
    ],
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
      ...commonBlockWidgetExtensions({
        runQuery: config.runQuery,
        onOpenLink: config.onOpenLink,
      }),
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
    // HTML + table widgets render in read-only previews too (no DQL).
    ...commonBlockWidgetExtensions(),
    // Read-only preview panes always fully render (no cursor-based reveal).
    renderModeReading,
    EditorView.lineWrapping,
  ];
}

/**
 * Full extension stack for reading mode (ADR-029). Uses the same grammar and
 * live-preview decoration engine as edit mode, but configured read-only:
 *
 * - All block widgets render rich content (no cursor to reveal raw source).
 * - DQL query blocks execute and render live results.
 * - `![[embed]]` resolves to actual media via `resolveAssetFacet`.
 * - Wikilinks and links are clickable via `readingLinkHandler`.
 * - `EditorState.readOnly` + `EditorView.editable` disable editing.
 *
 * The caller provides dependency facets (runQuery, resolveAsset, etc.) via the
 * config object. The returned extensions are used with a CM6 Compartment in
 * `EditorController.setMode()` to switch between edit and reading modes
 * without recreating the view.
 */
export function readingExtensions(config: {
  runQuery?: EditorConfig["runQuery"];
  onOpenLink?: EditorConfig["onOpenLink"];
  openExternalLink?: EditorConfig["openExternalLink"];
  resolveAsset?: EditorConfig["resolveAsset"];
  parseFrontmatter?: EditorConfig["parseFrontmatter"];
}): Extension[] {
  return [
    // Same markdown grammar + live-preview as edit mode.
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      extensions: basaltMarkdownExtensions,
    }),
    codeSyntaxHighlightingExtension(),
    ...LIVE_PREVIEW_THEME,
    ...livePreviewPlugin,
    // Block widgets — all render rich in read-only (no cursor to activate/deactivate).
    ...frontmatterBlockWidgetGroup({
      parseFrontmatter: config.parseFrontmatter,
    }),
    ...commonBlockWidgetExtensions({
      runQuery: config.runQuery,
      onOpenLink: config.onOpenLink,
    }),
    // Embed asset resolution facet.
    resolveAssetFacet.of(config.resolveAsset),
    // External http/https links — system browser via injected opener.
    openExternalLinkFacet.of(config.openExternalLink),
    // Reading-mode embed: resolves ![[file]] to actual media.
    EMBED_MEDIA_THEME,
    embedMediaPlugin,
    // Link click handling in reading mode.
    readingLinkHandler(),
    EditorView.lineWrapping,
  ];
}

/** Reading-specific extensions only — block widgets (reading config), embed media,
 * link handler, readOnly/editable. Used inside the mode compartment; the shared
 * grammar + live-preview live outside the compartment. */
export function readingModeExtras(config: {
  runQuery?: EditorConfig["runQuery"];
  onOpenLink?: EditorConfig["onOpenLink"];
  openExternalLink?: EditorConfig["openExternalLink"];
  resolveAsset?: EditorConfig["resolveAsset"];
  parseFrontmatter?: EditorConfig["parseFrontmatter"];
}): Extension[] {
  return [
    ...frontmatterBlockWidgetGroup({
      parseFrontmatter: config.parseFrontmatter,
    }),
    ...commonBlockWidgetExtensions({
      runQuery: config.runQuery,
      onOpenLink: config.onOpenLink,
    }),
    resolveAssetFacet.of(config.resolveAsset),
    openExternalLinkFacet.of(config.openExternalLink),
    EMBED_MEDIA_THEME,
    embedMediaPlugin,
    readingLinkHandler(),
    renderModeReading,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
  ];
}

