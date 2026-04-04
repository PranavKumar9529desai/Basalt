export interface Highlight {
  start: number;
  end: number;
}

export interface Snippet {
  text: string;
  highlights: Highlight[];
}

export interface ContentResult {
  path: string;
  title: string;
  score: number;
  snippets: Snippet[];
}

export interface FileResult {
  path: string;
  title: string;
  score: number;
}
