import { useMemo } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/ui/button";
import { CORE_SPECS, specMatches } from "../specs";
import { useEnabledSections } from "../lib/registry";
import { useSettingsModalStore } from "../store";
import type { SettingsGroup } from "../types";
import { SettingsSearch } from "./layout/SettingsSearch";

const GROUP_LABELS: Record<SettingsGroup, string> = {
  options: "Options",
  "core-plugins": "Core plugins",
  "community-plugins": "Community plugins",
};

const GROUP_EMPTY: Partial<Record<SettingsGroup, string>> = {
  "core-plugins": "No core plugin settings yet",
  "community-plugins": "No community plugins installed",
};

const GROUPS: SettingsGroup[] = [
  "options",
  "core-plugins",
  "community-plugins",
];

/**
 * SettingsNav — left navigation sidebar (ADR-037 §4 / spec §2).
 *
 * Renders whatever the registry currently has, grouped into OPTIONS,
 * CORE PLUGINS, and COMMUNITY PLUGINS. Each row is icon + label with an
 * active pill highlight. During search, sections that contain no
 * matching item are hidden and survivors show a match-count badge.
 */
export function SettingsNav() {
  const sections = useEnabledSections();
  const { activeSection, setActiveSection, searchQuery, setSearchQuery } =
    useSettingsModalStore();

  const q = searchQuery.trim().toLowerCase();

  /** Per-section deep-search hit counts (label + declarative items). */
  const hitCounts = useMemo(() => {
    if (!q) return null;
    const counts = new Map<string, number>();
    for (const section of sections) {
      let n = section.label.toLowerCase().includes(q) ? 1 : 0;
      for (const spec of CORE_SPECS[section.id] ?? []) {
        if (specMatches(spec, q)) n += 1;
      }
      counts.set(section.id, n);
    }
    return counts;
  }, [q, sections]);

  return (
    <aside className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]">
      <div className="border-b border-[var(--sat-layout-border)] p-3">
        <SettingsSearch
          value={searchQuery}
          onChange={setSearchQuery}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- Intentional: focus search when settings opens (spec §2.1)
          autoFocus
        />
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {GROUPS.map((group) => {
          const groupSections = sections.filter((s) => s.group === group);
          const visible = q
            ? groupSections.filter((s) => (hitCounts?.get(s.id) ?? 0) > 0)
            : groupSections;

          return (
            <div key={group}>
              <div className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--sat-text-muted)] select-none">
                {GROUP_LABELS[group]}
              </div>
              {visible.length === 0 ? (
                <p className="px-3 py-1 text-xs italic text-[var(--sat-text-muted)]">
                  {GROUP_EMPTY[group] ?? ""}
                </p>
              ) : (
                visible.map((section) => {
                  const Icon = section.icon;
                  const active = section.id === activeSection;
                  const count = hitCounts?.get(section.id) ?? 0;
                  return (
                    <Button
                      key={section.id}
                      type="button"
                      variant="sat-ghost"
                      size="xs"
                      onClick={() => setActiveSection(section.id)}
                      className={cn(
                        "w-full gap-2.5 rounded-md justify-start",
                        active
                          ? "bg-[var(--sat-accent-primary)]/12 font-medium text-[var(--sat-accent-primary)]"
                          : "text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-2)] hover:text-[var(--sat-text-primary)]",
                      )}
                    >
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                        <Icon size={15} />
                      </span>
                      <span className="truncate">{section.label}</span>
                      {q && count > 0 && (
                        <span className="ml-auto rounded bg-[var(--sat-surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--sat-text-muted)]">
                          {count}
                        </span>
                      )}
                    </Button>
                  );
                })
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
