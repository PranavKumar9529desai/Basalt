import { create } from "zustand";
import type { ContentFeatures, ExportOptions } from "./types";
import {
  DEFAULT_EXPORT_OPTIONS,
  EMPTY_CONTENT_FEATURES,
} from "./types";

interface ExportStore {
  isOpen: boolean;
  noteContent: string | null;
  noteName: string | null;
  options: ExportOptions;
  contentFeatures: ContentFeatures;
  open: (content: string, name: string) => void;
  close: () => void;
  setOptions: (opts: Partial<ExportOptions>) => void;
}

export const useExportStore = create<ExportStore>()((set) => ({
  isOpen: false,
  noteContent: null,
  noteName: null,
  options: DEFAULT_EXPORT_OPTIONS,
  contentFeatures: EMPTY_CONTENT_FEATURES,

  open: (content, name) => {
    const contentFeatures = detectFeatures(content);
    set({ isOpen: true, noteContent: content, noteName: name, contentFeatures });
  },
  close: () =>
    set({
      isOpen: false,
      noteContent: null,
      noteName: null,
      contentFeatures: EMPTY_CONTENT_FEATURES,
    }),
  setOptions: (opts) =>
    set((s) => ({ options: { ...s.options, ...opts } })),
}));

function detectFeatures(content: string): ContentFeatures {
  return {
    hasFrontmatter: /^---\n[\s\S]*?\n---/.test(content),
    hasImages: /!\[[^\]]*\]\([^)]+\)/.test(content),
    hasTables: /^\|.+\|$/m.test(content),
    hasCodeBlocks: /^```/m.test(content),
  };
}
