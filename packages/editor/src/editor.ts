import { closeBrackets } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { backticksKeymap } from "./input/backticks";
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
import type { EditorConfig } from "./types";

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
        extensions: [
          wikiLinkExtension,
          highlightExtension,
          yamlFrontmatterExtension,
        ],
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
    ],
    livePreview: [LIVE_PREVIEW_THEME, livePreviewPlugin],
    suggestions: [
      SUGGESTIONS_THEME,
      createSuggestionsPlugin(onFetchLinks, onFetchTags),
    ],
    links: [clickableLinksPlugin(onOpenLink)],
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
  ];
}
