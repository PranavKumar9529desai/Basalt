import { create } from "zustand";

/**
 * SettingsModalStore — the modal shell's UI state (ADR-037).
 *
 * Section definitions live in the settings registry (`registry.ts`),
 * not here — this store tracks only transient modal state: open/closed,
 * which section is active, and the deep-search query. If a plugin
 * unregisters the active section, the panel falls back to "general".
 */
interface SettingsModalStore {
  isOpen: boolean;
  activeSection: string;
  searchQuery: string;
  open: (section?: string) => void;
  close: () => void;
  setActiveSection: (id: string) => void;
  setSearchQuery: (query: string) => void;
}

export const useSettingsModalStore = create<SettingsModalStore>()(
  (set, get) => ({
    isOpen: false,
    activeSection: "general",
    searchQuery: "",

    open: (section) =>
      set({
        isOpen: true,
        activeSection: section ?? get().activeSection,
        searchQuery: "",
      }),
    close: () => set({ isOpen: false }),
    setActiveSection: (id) => set({ activeSection: id }),
    setSearchQuery: (query) => set({ searchQuery: query }),
  }),
);
