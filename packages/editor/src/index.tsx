import React, { useCallback, useMemo, useRef, useState } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView, keymap } from "@codemirror/view";
import { closeBrackets } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import {
  IconLink,
  IconSearch,
  IconCopy,
  IconScissors,
  IconClipboard,
  IconFileText,
  IconHighlight,
  IconEraser,
  IconPlus,
} from "@tabler/icons-react";

import { CUSTOM_THEME } from "./theme";
import { backticksKeymap } from "./plugins/backticks";
import { taskListPlugin, TASK_CHECKBOX_THEME } from "./plugins/task-list";
import {
  livePreviewPlugin,
  LIVE_PREVIEW_THEME,
} from "./plugins/live-preview";
import {
  createSuggestionsPlugin,
  SUGGESTIONS_THEME,
  FetchLinksFn,
  FetchTagsFn,
} from "./plugins/suggestions";
import { wikiLinkExtension, clickableLinksPlugin } from "./plugins/links";
import {
  contextMenuExtension,
  ContextMenuState,
} from "./plugins/context-menu";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@workspace/ui/components/ui/context-menu";

// ----------------------------------------------------------------------------
// BASALT EDITOR ARCHITECTURE NOTE
// ... (rest of note)
// ----------------------------------------------------------------------------

export interface EditorProps {
  initialContent?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  onFetchLinks?: FetchLinksFn;
  onFetchTags?: FetchTagsFn;
  onOpenLink?: (link: string) => void;
  onSearch?: (query: string) => void;
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
  onSearch,
  themeExtensions,
  includeDefaultTheme = true,
}) => {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(initialContent);
  const content = isControlled ? (value as string) : internalValue;

  const [menuState, setMenuState] = useState<ContextMenuState | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const view = editorRef.current?.view;

  // --- EDITOR COMMANDS ---
  const wrapSelection = useCallback(
    (prefix: string, suffix: string = prefix) => {
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const text = view.state.sliceDoc(from, to);
      view.dispatch({
        changes: { from, to, insert: `${prefix}${text}${suffix}` },
        selection: { anchor: from + prefix.length + text.length },
      });
      view.focus();
    },
    [view]
  );

  const applyToLineStart = useCallback(
    (prefix: string) => {
      if (!view) return;
      const { head } = view.state.selection.main;
      const line = view.state.doc.lineAt(head);
      view.dispatch({
        changes: { from: line.from, to: line.from, insert: prefix },
      });
      view.focus();
    },
    [view]
  );

  const handleCommand = useCallback(
    (command: string) => {
      setMenuState(null);
      switch (command) {
        case "bold":
          wrapSelection("**");
          break;
        case "italic":
          wrapSelection("*");
          break;
        case "strikethrough":
          wrapSelection("~~");
          break;
        case "link":
          wrapSelection("[[", "]]");
          break;
        case "external-link":
          wrapSelection("[", "](url)");
          break;
        case "h1":
          applyToLineStart("# ");
          break;
        case "h2":
          applyToLineStart("## ");
          break;
        case "h3":
          applyToLineStart("### ");
          break;
        case "select-all":
          view?.dispatch({
            selection: { anchor: 0, head: view.state.doc.length },
          });
          break;
        case "cut":
          document.execCommand("cut");
          break;
        case "copy":
          document.execCommand("copy");
          break;
        case "paste":
        case "paste-plain":
          navigator.clipboard.readText().then((text) => {
            if (view) {
              const { from, to } = view.state.selection.main;
              const content = command === "paste-plain"
                ? text.replace(/[\r\n]+/g, " ") // Simplistic plain text for now, or just text
                : text;
              view.dispatch({ changes: { from, to, insert: content } });
            }
          });
          break;
      }
    },
    [view, wrapSelection, applyToLineStart]
  );

  const handleChange = useCallback(
    (val: string) => {
      if (!isControlled) {
        setInternalValue(val);
      }
      if (onChange) {
        onChange(val);
      }
    },
    [isControlled, onChange]
  );

  const editorExtensions = useMemo(() => {
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
      contextMenuExtension(setMenuState),
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
    <div className={`w-full h-full flex flex-col bg-[var(--sat-editor-background,#0f172a)] ${className}`}>
      <div className="flex-1 overflow-hidden relative">
        <ContextMenu
          open={!!menuState}
          onOpenChange={(open) => !open && setMenuState(null)}
        >
          <CodeMirror
            ref={editorRef}
            value={content}
            height="100%"
            basicSetup={BASIC_SETUP}
            extensions={editorExtensions}
            onChange={handleChange}
            className="h-full"
          />

          {menuState && (
            <ContextMenuContent
              style={{
                position: "fixed",
                left: menuState.x,
                top: menuState.y,
              }}
            >
              <ContextMenuItem
                icon={<IconLink />}
                onClick={() => handleCommand("link")}
              >
                Add link
              </ContextMenuItem>
              <ContextMenuItem
                icon={<IconLink className="opacity-70" />}
                onClick={() => handleCommand("external-link")}
              >
                Add external link
              </ContextMenuItem>
              <ContextMenuSeparator />
              {menuState.selection.text && (
                <ContextMenuItem
                  icon={<IconSearch />}
                  onClick={() => {
                    onSearch?.(menuState.selection.text);
                    setMenuState(null);
                  }}
                >
                  Search for "{menuState.selection.text}"
                </ContextMenuItem>
              )}
              <ContextMenuItem
                icon={<IconPlus />}
                onClick={() => handleCommand("extract")}
              >
                Extract current selection...
              </ContextMenuItem>

              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger icon={<IconFileText />}>
                  Format
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem onClick={() => handleCommand("bold")}>
                    Bold
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleCommand("italic")}>
                    Italic
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => handleCommand("strikethrough")}
                  >
                    Strikethrough
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>

              <ContextMenuSub>
                <ContextMenuSubTrigger icon={<IconFileText />}>
                  Paragraph
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem onClick={() => handleCommand("h1")}>
                    Heading 1
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleCommand("h2")}>
                    Heading 2
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleCommand("h3")}>
                    Heading 3
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>

              <ContextMenuSub>
                <ContextMenuSubTrigger icon={<IconPlus />}>
                  Insert
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem>Callout</ContextMenuItem>
                  <ContextMenuItem>Code block</ContextMenuItem>
                  <ContextMenuItem>Table</ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>

              <ContextMenuSeparator />
              <ContextMenuItem
                icon={<IconScissors />}
                shortcut="Ctrl+X"
                onClick={() => handleCommand("cut")}
              >
                Cut
              </ContextMenuItem>
              <ContextMenuItem
                icon={<IconCopy />}
                shortcut="Ctrl+C"
                onClick={() => handleCommand("copy")}
              >
                Copy
              </ContextMenuItem>
              <ContextMenuItem
                icon={<IconClipboard />}
                shortcut="Ctrl+V"
                onClick={() => handleCommand("paste")}
              >
                Paste
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleCommand("paste-plain")}>
                Paste as plain text
              </ContextMenuItem>
              <ContextMenuItem
                shortcut="Ctrl+A"
                onClick={() => handleCommand("select-all")}
              >
                Select all
              </ContextMenuItem>

              <ContextMenuSeparator />
              <ContextMenuItem icon={<IconHighlight />}>
                Highlight
              </ContextMenuItem>
              <ContextMenuItem icon={<IconEraser />}>
                Erase highlight
              </ContextMenuItem>
            </ContextMenuContent>
          )}
        </ContextMenu>
      </div>
    </div>
  );
};
