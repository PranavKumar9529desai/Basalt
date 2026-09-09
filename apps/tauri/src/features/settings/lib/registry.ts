import { create } from "zustand";
import type { SettingSectionDef, SettingsGroup } from "../types";

/**
 * SettingsRegistry — dynamic settings-tab registry (ADR-037 §1).
 *
 * Same pattern as ViewRegistry (ADR-018): sections register by string
 * id; the sidebar and panel render whatever is registered. Unlike
 * ViewRegistry this is backed by a Zustand store so the nav re-renders
 * the moment a plugin registers/unregisters its tab (enabling the
 * Obsidian behavior: enabling a core plugin adds its tab instantly,
 * disabling it removes the tab).
 *
 * Lifecycle contract:
 * - A plugin calls `settingsRegistry.register(...)` on load/enable.
 * - Disabling a plugin calls `settingsRegistry.unregister(id)` — the
 *   modal store falls back to "general" if that section was active.
 */
interface SettingsRegistryState {
  sections: SettingSectionDef[];
  register: (section: SettingSectionDef) => void;
  unregister: (id: string) => void;
}

export const useSettingsRegistry = create<SettingsRegistryState>()(
  (set, get) => ({
    sections: [],
    register: (section) => {
      if (get().sections.some((s) => s.id === section.id)) {
        console.warn(
          `Settings section "${section.id}" already registered. Overwriting.`,
        );
      }
      set((state) => ({
        sections: [
          ...state.sections.filter((s) => s.id !== section.id),
          section,
        ],
      }));
    },
    unregister: (id) =>
      set((state) => ({ sections: state.sections.filter((s) => s.id !== id) })),
  }),
);

/** Imperative API — for plugin lifecycle code (module scope, effects). */
export const settingsRegistry = {
  register: (section: SettingSectionDef) =>
    useSettingsRegistry.getState().register(section),
  unregister: (id: string) => useSettingsRegistry.getState().unregister(id),
  getAll: (): SettingSectionDef[] => useSettingsRegistry.getState().sections,
};

/** Sections in nav order: group first, then `order`, then registration order. */
export function sortSections(
  sections: SettingSectionDef[],
): SettingSectionDef[] {
  const groupRank: Record<SettingsGroup, number> = {
    options: 0,
    "core-plugins": 1,
    "community-plugins": 2,
  };
  return [...sections].sort((a, b) => {
    const g = groupRank[a.group] - groupRank[b.group];
    if (g !== 0) return g;
    return (
      (a.order ?? Number.MAX_SAFE_INTEGER) -
      (b.order ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

/** React hook: all registered sections in nav order. */
export function useSections(): SettingSectionDef[] {
  const sections = useSettingsRegistry((s) => s.sections);
  return sortSections(sections);
}

/** Sections visible now — `isEnabled` predicates evaluated. */
export function useEnabledSections(): SettingSectionDef[] {
  return useSections().filter((s) => (s.isEnabled ? s.isEnabled() : true));
}
