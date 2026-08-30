import { languages } from "@codemirror/language-data";
import { highlightTree } from "@lezer/highlight";
import { codeSyntaxHighlighter } from "./code-highlight-style";

export interface CodeToken {
  from: number;
  to: number;
  classes: string;
}

/**
 * Match a fenced-code info string to a `@codemirror/language-data` language.
 * Accepts the language alias (`ts`, `typescript`) or a file extension (`py`).
 */
function languageDescriptionFor(info: string) {
  const raw = info.trim().split(/\s+/)[0]?.toLowerCase();
  if (!raw) return undefined;
  return (
    languages.find(
      (language) =>
        language.alias.includes(raw) || language.extensions.includes(raw),
    ) ?? undefined
  );
}

/**
 * Tokenise a code fragment for its fence language. Returns ranges carrying
 * `sat-syntax-*` classes (the same ones the editor emits). Loading a language
 * is async via `language-data`, so this returns a Promise; the reading view
 * caches results so a language only loads/parses once.
 */
export async function tokenizeCode(
  code: string,
  info: string | undefined,
): Promise<CodeToken[]> {
  if (!info) return [];
  const description = languageDescriptionFor(info);
  if (!description) return [];
  const support = await description.load();
  const parser = support.language.parser;
  const tree = parser.parse(code);
  const tokens: CodeToken[] = [];
  highlightTree(tree, codeSyntaxHighlighter, (from, to, classes) => {
    tokens.push({ from, to, classes });
  });
  return tokens;
}