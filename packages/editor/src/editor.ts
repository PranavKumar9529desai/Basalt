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
import { CUSTOM_THEME } from "./styling/base";
import { yamlFrontmatterExtension } from "./syntax/frontmatter";
import { highlightExtension } from "./syntax/highlight";
import { clickableLinksPlugin, wikiLinkExtension } from "./syntax/wiki-links";
import type { EditorConfig } from "./types";

export function createEditorExtensions(config: EditorConfig): Extension[] {
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
    themeStack.push(CUSTOM_THEME);
  }

  return [
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
    TASK_CHECKBOX_THEME,
    taskListPlugin,
    LIVE_PREVIEW_THEME,
    livePreviewPlugin,
    closeBrackets(),
    keymap.of(backticksKeymap),
    SUGGESTIONS_THEME,
    createSuggestionsPlugin(onFetchLinks, onFetchTags),
    clickableLinksPlugin(onOpenLink),
    EditorView.lineWrapping,
  ];
}
