import React, { useCallback, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView, keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { closeBrackets } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

import { CUSTOM_THEME } from "./theme";
import { backticksKeymap } from "./plugins/backticks";
import { taskListPlugin, TASK_CHECKBOX_THEME } from "./plugins/task-list";
import { livePreviewPlugin, LIVE_PREVIEW_THEME } from "./plugins/live-preview";
import {
  createSuggestionsPlugin,
  SUGGESTIONS_THEME,
  FetchLinksFn,
  FetchTagsFn,
} from "./plugins/suggestions";
import { wikiLinkExtension, clickableLinksPlugin } from "./plugins/links";

// ----------------------------------------------------------------------------
// BASALT EDITOR ARCHITECTURE NOTE
//
// This package (@workspace/editor) handles the core CodeMirror logic.
// It acts strictly as a markdown parser and semantic tagger (like Obsidian's Live Preview).
//
// - It injects dynamic CSS classes (e.g., .cm-live-heading-1) onto markdown elements.
// - It conditionally hides markdown syntax markers (like # or **) when a line is NOT focused.
// - Currently, CSS styles are injected via CodeMirror Extensions (EditorView.baseTheme).
//
// TODO (Future refactoring):
// For standard separation of concerns and easier theming (the specific Obsidian pattern),
// all visual styles (font sizes, colors, margins) should eventually be moved out of
// this TypeScript file and into the app's global CSS or Tailwind layer (apps/tauri).
// This file should solely manage DOM structure and class name toggling.
// ----------------------------------------------------------------------------

export interface EditorProps {
  initialContent?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  onFetchLinks?: FetchLinksFn;
  onFetchTags?: FetchTagsFn;
  onOpenLink?: (link: string) => void;
  /**
   * Optional theme extensions to inject (e.g., CSS-var based themes).
   * They are applied before the built-in defaults so they can override colors.
   */
  themeExtensions?: Extension[];
  /**
   * Whether to include the built-in dark theme defaults.
   * Keep true unless you want a fully custom theme stack.
   */
  includeDefaultTheme?: boolean;
}

const BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
};

export const Editor: React.FC<EditorProps> = ({
  initialContent = "",
  value,
  onChange,
  className = "",
  onFetchLinks,
  onFetchTags,
  onOpenLink,
  themeExtensions,
  includeDefaultTheme = true,
}) => {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(initialContent);
  const content = isControlled ? (value as string) : internalValue;

  const handleChange = useCallback(
    (val: string) => {
      if (!isControlled) {
        setInternalValue(val);
      }
      if (onChange) {
        onChange(val);
      }
    },
    [isControlled, onChange],
  );

  const editorExtensions = useMemo(() => {
    const themeStack: Extension[] = [];
    if (themeExtensions) themeStack.push(...themeExtensions);
    if (includeDefaultTheme) {
      themeStack.push(oneDark, CUSTOM_THEME);
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
  }, [
    includeDefaultTheme,
    onFetchLinks,
    onFetchTags,
    onOpenLink,
    themeExtensions,
  ]);

  return (
    <div className={`w-full h-full flex flex-col bg-zinc-950 ${className}`}>
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          value={content}
          height="100%"
          basicSetup={BASIC_SETUP}
          extensions={editorExtensions}
          onChange={handleChange}
          className="h-full"
        />
      </div>
    </div>
  );
};
