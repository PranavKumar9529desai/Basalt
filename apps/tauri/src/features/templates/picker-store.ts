import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

interface TemplatePickerStore {
  isOpen: boolean;
  /** Template file names from the template folder (sorted, e.g. `meeting.md`). */
  templates: string[];
  query: string;
  selectedIndex: number;
  isLoading: boolean;
  error: string | null;
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  selectNext: () => void;
  selectPrev: () => void;
}

export const useTemplatePickerStore = create<TemplatePickerStore>()(
  (set, get) => ({
    isOpen: false,
    templates: [],
    query: "",
    selectedIndex: 0,
    isLoading: false,
    error: null,

    open: () => {
      set({ isOpen: true, query: "", selectedIndex: 0 });
      void (async () => {
        set({ isLoading: true, error: null });
        try {
          const templates = await invoke<string[]>("list_templates");
          set({ templates, isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: String(err) });
        }
      })();
    },
    close: () => set({ isOpen: false }),
    setQuery: (query) => set({ query, selectedIndex: 0 }),
    selectNext: () => {
      const { templates, query, selectedIndex } = get();
      const count = filterTemplates(templates, query).length;
      if (count > 0) set({ selectedIndex: (selectedIndex + 1) % count });
    },
    selectPrev: () => {
      const { templates, query, selectedIndex } = get();
      const count = filterTemplates(templates, query).length;
      if (count > 0)
        set({ selectedIndex: (selectedIndex - 1 + count) % count });
    },
  }),
);

/** Client-side, case-insensitive name filter — template folders are small. */
export function filterTemplates(templates: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return templates;
  return templates.filter((t) => t.toLowerCase().includes(q));
}
