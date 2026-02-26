import { closeBrackets } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { EditorConfig } from "./types";

import { backticksKeymap } from "./extensions/backticks";
import {
  LIVE_PREVIEW_THEME,
  livePreviewPlugin,
} from "./extensions/live-preview";
import {
  createSuggestionsPlugin,
  SUGGESTIONS_THEME,
} from "./extensions/suggestions";
import { TASK_CHECKBOX_THEME, taskListPlugin } from "./extensions/task-list";
import {
  clickableLinksPlugin,
  wikiLinkExtension,
} from "./extensions/wiki-links";
import { CUSTOM_THEME } from "./themes/base";

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
      extensions: [wikiLinkExtension],
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
