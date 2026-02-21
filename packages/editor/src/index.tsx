import React, { useState, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface EditorProps {
  initialContent?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export const Editor: React.FC<EditorProps> = ({
  initialContent = "",
  value,
  onChange,
  className = "",
}) => {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(initialContent);
  const content = isControlled ? (value as string) : internalValue;
  const [mode, setMode] = useState<"edit" | "preview" | "split">("split");

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

  // A custom theme extension to make CodeMirror fill its container and match Basalt styling
  const customTheme = EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      fontSize: "16px",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    },
    ".cm-scroller": {
      overflow: "auto",
      padding: "24px 32px",
    },
    ".cm-content": {
      maxWidth: "800px",
      margin: "0 auto",
      fontFamily: "inherit",
    },
    ".cm-line": {
      lineHeight: "1.6",
    },
    "&.cm-focused": {
      outline: "none",
    },
  });

  const markdownComponents: any = {
    h1: ({ children, ...props }: any) => (
      <h1 className="text-3xl font-bold mt-6 mb-4 text-slate-50" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: any) => (
      <h2
        className="text-2xl font-semibold mt-5 mb-3 text-slate-100"
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: any) => (
      <h3 className="text-xl font-semibold mt-4 mb-2 text-slate-200" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }: any) => (
      <p className="text-slate-200 leading-7 mb-3" {...props}>
        {children}
      </p>
    ),
    strong: ({ children, ...props }: any) => (
      <strong className="font-semibold text-slate-50" {...props}>
        {children}
      </strong>
    ),
    em: ({ children, ...props }: any) => (
      <em className="italic text-slate-200" {...props}>
        {children}
      </em>
    ),
    code: ({ children, ...props }: any) => (
      <code
        className="bg-zinc-800 px-1.5 py-0.5 rounded text-amber-200 text-sm"
        {...props}
      >
        {children}
      </code>
    ),
    pre: ({ children, ...props }: any) => (
      <pre
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-x-auto text-slate-100 text-sm mb-4"
        {...props}
      >
        {children}
      </pre>
    ),
    blockquote: ({ children, ...props }: any) => (
      <blockquote
        className="border-l-4 border-blue-500 pl-4 italic text-slate-300 mb-4"
        {...props}
      >
        {children}
      </blockquote>
    ),
    ul: ({ children, ...props }: any) => (
      <ul
        className="list-disc list-inside space-y-2 text-slate-200 mb-4"
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: any) => (
      <ol
        className="list-decimal list-inside space-y-2 text-slate-200 mb-4"
        {...props}
      >
        {children}
      </ol>
    ),
    li: ({ children, ...props }: any) => (
      <li className="leading-7" {...props}>
        {children}
      </li>
    ),
    a: ({ children, ...props }: any) => (
      <a className="text-blue-400 hover:text-blue-300 underline" {...props}>
        {children}
      </a>
    ),
    hr: (props: any) => <hr className="border-zinc-800 my-6" {...props} />,
    table: ({ children, ...props }: any) => (
      <table className="w-full text-left border-collapse mb-4" {...props}>
        {children}
      </table>
    ),
    thead: ({ children, ...props }: any) => (
      <thead className="bg-zinc-900 text-slate-100" {...props}>
        {children}
      </thead>
    ),
    tbody: ({ children, ...props }: any) => (
      <tbody className="divide-y divide-zinc-800" {...props}>
        {children}
      </tbody>
    ),
    tr: ({ children, ...props }: any) => (
      <tr className="border-b border-zinc-800" {...props}>
        {children}
      </tr>
    ),
    th: ({ children, ...props }: any) => (
      <th className="py-2 px-3 font-semibold border border-zinc-800" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td
        className="py-2 px-3 text-slate-200 border border-zinc-800"
        {...props}
      >
        {children}
      </td>
    ),
  };

  const buttonBase =
    "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors";
  const getButtonClass = (currentMode: typeof mode, target: typeof mode) =>
    `${buttonBase} ${currentMode === target ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-900 border-zinc-700 text-slate-200 hover:bg-zinc-800"}`;

  return (
    <div className={`w-full h-full flex flex-col bg-zinc-950 ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/70">
        <span className="text-sm text-slate-400 mr-2">View</span>
        <button
          type="button"
          className={getButtonClass(mode, "edit")}
          onClick={() => setMode("edit")}
        >
          Edit
        </button>
        <button
          type="button"
          className={getButtonClass(mode, "preview")}
          onClick={() => setMode("preview")}
        >
          Preview
        </button>
        <button
          type="button"
          className={getButtonClass(mode, "split")}
          onClick={() => setMode("split")}
        >
          Split
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {(mode === "edit" || mode === "split") && (
          <div
            className={`h-full ${mode === "split" ? "w-full md:w-1/2 border-r border-zinc-800" : "w-full"}`}
          >
            <CodeMirror
              value={content}
              height="100%"
              extensions={[
                markdown({ base: markdownLanguage, codeLanguages: languages }),
                oneDark,
                customTheme,
                EditorView.lineWrapping,
              ]}
              onChange={handleChange}
              className="h-full"
            />
          </div>
        )}
        {(mode === "preview" || mode === "split") && (
          <div
            className={`h-full overflow-auto bg-zinc-900 ${mode === "split" ? "w-full md:w-1/2" : "w-full"}`}
          >
            <div className="min-h-full w-full px-8 py-6">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {content || "Nothing to preview yet."}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
