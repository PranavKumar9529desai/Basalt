import type { Extension } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createEditorExtensions,
  registerEditorCommands,
  type FetchLinksFn,
  type FetchTagsFn,
} from "@workspace/editor";

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

export function EditorComponent({
  initialContent = "",
  value,
  onChange,
  className = "",
  onFetchLinks,
  onFetchTags,
  onOpenLink,
  themeExtensions,
  includeDefaultTheme = true,
  extensions = [],
}: EditorProps & { extensions?: Extension[] }) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(initialContent);
  const content = isControlled ? (value as string) : internalValue;

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const view = editorRef.current?.view;

  const allExtensions = useMemo(() => {
    return [
      ...createEditorExtensions({
        onFetchLinks,
        onFetchTags,
        onOpenLink,
        themeExtensions,
        includeDefaultTheme,
      }),
      ...extensions,
    ];
  }, [
    includeDefaultTheme,
    onFetchLinks,
    onFetchTags,
    onOpenLink,
    themeExtensions,
    extensions,
  ]);

  useEffect(() => {
    if (view) {
      return registerEditorCommands(view);
    }
  }, [view]);

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

  return (
    <div
      className={`w-full h-full flex flex-col bg-[var(--sat-editor-background,#0f172a)] ${className}`}
    >
      <div className="flex-1 overflow-hidden relative">
        <CodeMirror
          ref={editorRef}
          value={content}
          height="100%"
          basicSetup={BASIC_SETUP}
          extensions={allExtensions}
          onChange={handleChange}
          className="h-full"
        />
      </div>
    </div>
  );
}
