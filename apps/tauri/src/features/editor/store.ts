import { create } from "zustand";
import type {
  EditorPaneId,
  EditorSessionSnapshot,
} from "./types";

interface EditorSessionsState {
  sessions: Record<EditorPaneId, EditorSessionSnapshot>;
  ensureSession: (paneId: EditorPaneId) => void;
  updateSession: (
    paneId: EditorPaneId,
    patch: Partial<Omit<EditorSessionSnapshot, "paneId">>,
  ) => void;
  removeSession: (paneId: EditorPaneId) => void;
  reset: () => void;
}

function createDefaultSession(paneId: EditorPaneId): EditorSessionSnapshot {
  return {
    paneId,
    selected: null,
    content: "",
    backlinks: [],
    saveStatus: "saved",
    status: null,
  };
}

export const useEditorSessionsStore = create<EditorSessionsState>()((set) => ({
  sessions: {},
  ensureSession: (paneId) =>
    set((state) => {
      if (state.sessions[paneId]) {
        return state;
      }
      return {
        sessions: {
          ...state.sessions,
          [paneId]: createDefaultSession(paneId),
        },
      };
    }),
  updateSession: (paneId, patch) =>
    set((state) => {
      const prev = state.sessions[paneId] ?? createDefaultSession(paneId);
      return {
        sessions: {
          ...state.sessions,
          [paneId]: {
            ...prev,
            ...patch,
          },
        },
      };
    }),
  removeSession: (paneId) =>
    set((state) => {
      if (!state.sessions[paneId]) {
        return state;
      }
      const { [paneId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    }),
  reset: () => set({ sessions: {} }),
}));
