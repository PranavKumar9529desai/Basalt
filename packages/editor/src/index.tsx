import { closeBrackets } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@workspace/ui/components/ui/context-menu";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useCommandStore } from "./commands/store";
import { useEditorCommands } from "./hooks/use-editor-commands";
import { backticksKeymap } from "./extensions/backticks";
import {
  type ContextMenuState,
  contextMenuExtension,
} from "./extensions/context-menu";
import { clickableLinksPlugin, wikiLinkExtension } from "./extensions/wiki-links";
import { LIVE_PREVIEW_THEME, livePreviewPlugin } from "./extensions/live-preview";
import {
  createSuggestionsPlugin,
  type FetchLinksFn,
  type FetchTagsFn,
  SUGGESTIONS_THEME,
} from "./extensions/suggestions";
import { TASK_CHECKBOX_THEME, taskListPlugin } from "./extensions/task-list";
import { CUSTOM_THEME } from "./themes/base";

export * from "./commands/store";
export * from "./hooks/use-editor-commands";

// ----------------------------------------------------------------------------
// BASALT EDITOR ARCHITECTURE NOTE
//
// The Basalt editor is built on CodeMirror 6, using a highly modular plugin
// system. Most editor features (live preview, wiki-links, task lists) are
// implemented as CodeMirror Extensions.
//
// The editor also integrates with a global Command Registry, allowing
// both built-in features and external extensions to register commands
// that can be triggered via the Command Palette (Ctrl+P) or Context Menu.
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
  highlightActiveLine: false,
};

const EditorContent: React.FC<EditorProps> = ({
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
  const execute = useCommandStore((s) => s.execute);
  const commandsObj = useCommandStore((s) => s.commands);
  const commands = useMemo(() => Object.values(commandsObj), [commandsObj]);

  // --- EDITOR COMMANDS ---
  // Registers editor formatting commands automatically
  useEditorCommands(view);

  const handleCommand = useCallback(
    (commandId: string) => {
      setMenuState(null);
      execute(commandId);
    },
    [execute],
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
    [isControlled, onChange],
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

  const menuAnchor = useMemo(() => {
    if (!menuState) return null;
    return {
      getBoundingClientRect: () => new DOMRect(menuState.x, menuState.y, 0, 0),
    };
  }, [menuState]);

  // Group commands for context menu
  const formatCommands = commands.filter((c) => c.category === "Format");
  const editorCommands = commands.filter((c) => c.category === "Editor");

  return (
    <div
      className={`w-full h-full flex flex-col bg-[var(--sat-editor-background,#0f172a)] ${className}`}
    >
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
            <ContextMenuContent anchor={menuAnchor}>
              {editorCommands.map((cmd) => (
                <ContextMenuItem
                  key={cmd.id}
                  icon={cmd.icon}
                  onClick={() => handleCommand(cmd.id)}
                  shortcut={cmd.hotkeys?.[0]}
                >
                  {cmd.name}
                </ContextMenuItem>
              ))}

              <ContextMenuSeparator />

              {menuState.selection.text && (
                <>
                  <ContextMenuItem
                    onClick={() => {
                      onSearch?.(menuState.selection.text);
                      setMenuState(null);
                    }}
                  >
                    Search for "{menuState.selection.text}"
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}

              <ContextMenuSub>
                <ContextMenuSubTrigger>Format</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {formatCommands.map((cmd) => (
                    <ContextMenuItem
                      key={cmd.id}
                      onClick={() => handleCommand(cmd.id)}
                      shortcut={cmd.hotkeys?.[0]}
                    >
                      {cmd.name}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            </ContextMenuContent>
          )}
        </ContextMenu>
      </div>
    </div>
  );
};

export const Editor: React.FC<EditorProps> = (props) => (
  <EditorContent {...props} />
);
