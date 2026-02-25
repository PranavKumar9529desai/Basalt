import type { Extension } from "@codemirror/state";

export type FetchLinksFn = (query: string) => Promise<Array<{ name: string; path: string }>>;
export type FetchTagsFn = (query: string) => Promise<string[]>;

export interface EditorConfig {
    onFetchLinks?: FetchLinksFn;
    onFetchTags?: FetchTagsFn;
    onOpenLink?: (link: string) => void;
    themeExtensions?: Extension[];
    includeDefaultTheme?: boolean;
}
