import { create } from "zustand";
import type { ExportOptions } from "./types";
import { DEFAULT_EXPORT_OPTIONS } from "./types";

interface ExportStore {
  isOpen: boolean;
  noteContent: string | null;
  noteName: string | null;
  options: ExportOptions;
  open: (content: string, name: string) => void;
  close: () => void;
  setOptions: (opts: Partial<ExportOptions>) => void;
}

export const useExportStore = create<ExportStore>()((set) => ({
  isOpen: false,
  noteContent: null,
  noteName: null,
  options: DEFAULT_EXPORT_OPTIONS,

  open: (content, name) =>
    set({ isOpen: true, noteContent: content, noteName: name }),
  close: () => set({ isOpen: false, noteContent: null, noteName: null }),
  setOptions: (opts) =>
    set((s) => ({ options: { ...s.options, ...opts } })),
}));
