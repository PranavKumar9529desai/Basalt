import { lazy } from "react";
import { create } from "zustand";

export type SettingsGroup = "options" | "core-plugins" | "community-plugins";

export interface SectionDef {
  id: string;
  label: string;
  group: SettingsGroup;
  component: React.LazyExoticComponent<React.ComponentType>;
}

interface SettingsModalStore {
  isOpen: boolean;
  activeSection: string;
  sections: SectionDef[];
  open: (section?: string) => void;
  close: () => void;
  setActiveSection: (id: string) => void;
  registerSection: (def: SectionDef) => void;
  unregisterSection: (id: string) => void;
}

const CORE_SECTIONS: SectionDef[] = [
  {
    id: "general",
    label: "General",
    group: "options",
    component: lazy(() => import("./components/sections/GeneralSection")),
  },
  {
    id: "editor",
    label: "Editor",
    group: "options",
    component: lazy(() => import("./components/sections/EditorSection")),
  },
  {
    id: "files-links",
    label: "Files & links",
    group: "options",
    component: lazy(() => import("./components/sections/FilesLinksSection")),
  },
  {
    id: "appearance",
    label: "Appearance",
    group: "options",
    component: lazy(() => import("./components/sections/AppearanceSection")),
  },
  {
    id: "hotkeys",
    label: "Hotkeys",
    group: "options",
    component: lazy(() => import("./components/sections/HotkeysSection")),
  },
];

export const useSettingsModalStore = create<SettingsModalStore>()((set, get) => ({
  isOpen: false,
  activeSection: "general",
  sections: CORE_SECTIONS,

  open: (section) =>
    set({ isOpen: true, activeSection: section ?? get().activeSection }),
  close: () => set({ isOpen: false }),
  setActiveSection: (id) => set({ activeSection: id }),
  registerSection: (def) =>
    set((state) => ({
      sections: state.sections.some((s) => s.id === def.id)
        ? state.sections
        : [...state.sections, def],
    })),
  unregisterSection: (id) =>
    set((state) => ({
      sections: state.sections.filter((s) => s.id !== id),
    })),
}));
