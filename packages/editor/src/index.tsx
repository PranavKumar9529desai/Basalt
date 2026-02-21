import React, { useState, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';

export interface EditorProps {
    initialContent?: string;
    onChange?: (value: string) => void;
    className?: string;
}

export const Editor: React.FC<EditorProps> = ({
    initialContent = '',
    onChange,
    className = ''
}) => {
    const [value, setValue] = useState(initialContent);

    const handleChange = useCallback((val: string, viewUpdate: any) => {
        setValue(val);
        if (onChange) {
            onChange(val);
        }
    }, [onChange]);

    // A custom theme extension to make CodeMirror fill its container and match Basalt styling
    const customTheme = EditorView.theme({
        "&": {
            height: "100%",
            backgroundColor: "transparent",
            fontSize: "16px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
        },
        ".cm-scroller": {
            overflow: "auto",
            padding: "24px 32px"
        },
        ".cm-content": {
            maxWidth: "800px",
            margin: "0 auto",
            fontFamily: "inherit"
        },
        ".cm-line": {
            lineHeight: "1.6"
        },
        "&.cm-focused": {
            outline: "none"
        }
    });

    return (
        <div className={`w-full h-full flex flex-col items-center bg-zinc-950 ${className}`}>
            <div className="w-full h-full">
                <CodeMirror
                    value={value}
                    height="100%"
                    extensions={[
                        markdown({ base: markdownLanguage, codeLanguages: languages }),
                        oneDark,
                        customTheme,
                        EditorView.lineWrapping
                    ]}
                    onChange={handleChange}
                    className="h-full"
                />
            </div>
        </div>
    );
};
