import type { LinkSuggestion, SaveStatus } from "../vault/types";

export type EditorPaneId = string;

export interface EditorSessionSnapshot {
  paneId: EditorPaneId;
  selected: LinkSuggestion | null;
  content: string;
  backlinks: string[];
  saveStatus: SaveStatus;
  status: string | null;
}
