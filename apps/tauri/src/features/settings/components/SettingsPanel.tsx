import { Suspense } from "react";
import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
import { useEnabledSections } from "../lib/registry";
import { useSettingsModalStore } from "../store";
import { SettingsFields } from "./layout/SettingsFields";

/**
 * SettingsPanel — right content pane (ADR-037 §3 / spec §3).
 *
 * Owns the section header (title + description); the body comes from
 * either a custom `component` (Hotkeys, plugin managers) or the
 * declarative `specs` rendered by SettingsFields. Items are filtered
 * live by the nav's deep-search query.
 */
export function SettingsPanel() {
  const { activeSection, searchQuery } = useSettingsModalStore();
  const sections = useEnabledSections();
  const section =
    sections.find((s) => s.id === activeSection) ??
    sections.find((s) => s.id === "general");

  if (!section) return null;

  const Component = section.component;

  return (
    <ScrollArea className="h-full flex-1 bg-[var(--sat-surface-1)]">
      <div className="mx-auto max-w-3xl px-10 py-7">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--sat-text-primary)]">
          {section.label}
        </h2>
        {section.description && (
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--sat-text-muted)]">
            {section.description}
          </p>
        )}
        <div className="mt-4 mb-6 border-b border-[var(--sat-layout-border)]" />
        {Component ? (
          <Suspense fallback={null}>
            <Component />
          </Suspense>
        ) : section.specs ? (
          <SettingsFields specs={section.specs} query={searchQuery} />
        ) : (
          <p className="text-xs text-[var(--sat-text-muted)]">
            No settings for this section yet.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
