# Settings Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the settings modal shell — full-screen overlay with left nav (cmdk), right panel, and Zustand section registry. No settings content yet.

**Architecture:** Zustand store holds `sections[]` and open/close state. `SettingsModal` is a shadcn Dialog overridden to full-screen, mounted in `WorkspaceView` alongside `SearchModal`. `SettingsNav` wraps cmdk `Command` so keyboard navigation and live search filtering work for free.

**Tech Stack:** React 18, Zustand v5, cmdk (via `@workspace/ui/components/ui/command`), shadcn Dialog/ScrollArea/Separator/Button from `@workspace/ui/components/ui/`, `@base-ui/react/dialog`, Tailwind + `--sat-*` CSS tokens.

---

## Parallel Execution Map

```
[Task 1: Store] ──┐
                  ├──▶ [Task 3: SettingsNav] ──┐
[Task 2: Sections]┘                             ├──▶ [Task 5: SettingsModal]
                  └──▶ [Task 4: SettingsPanel] ─┘        │
                                                          ▼
                                               [Task 6: index.ts]
                                                          │
                                                          ▼
                                               [Task 7: Wiring]
                                                          │
                                                          ▼
                                               [Task 8: Lint + typecheck]
```

**Tasks 1 and 2 are independent — run in parallel.**
**Tasks 3 and 4 are independent of each other — run in parallel after 1+2.**

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| CREATE | `apps/tauri/src/features/settings/store.ts` | Zustand store: open/close, activeSection, sections registry |
| CREATE | `apps/tauri/src/features/settings/components/sections/GeneralSection.tsx` | Placeholder panel |
| CREATE | `apps/tauri/src/features/settings/components/sections/EditorSection.tsx` | Placeholder panel |
| CREATE | `apps/tauri/src/features/settings/components/sections/FilesLinksSection.tsx` | Placeholder panel |
| CREATE | `apps/tauri/src/features/settings/components/sections/AppearanceSection.tsx` | Placeholder panel |
| CREATE | `apps/tauri/src/features/settings/components/sections/HotkeysSection.tsx` | Placeholder panel |
| CREATE | `apps/tauri/src/features/settings/components/SettingsNav.tsx` | cmdk left nav, reads sections[] from store |
| CREATE | `apps/tauri/src/features/settings/components/SettingsPanel.tsx` | ScrollArea wrapping active section via Suspense |
| CREATE | `apps/tauri/src/features/settings/components/SettingsModal.tsx` | Full-screen Dialog shell |
| CREATE | `apps/tauri/src/features/settings/index.ts` | Public re-exports |
| MODIFY | `apps/tauri/src/layout/ActivityBar.tsx` | Wire settings icon click → store.open() |
| MODIFY | `apps/tauri/src/layout/WorkspaceView.tsx` | Mount SettingsModal, import from features/settings |
| MODIFY | `apps/tauri/src/layout/commands.tsx` | Add Cmd+, keyboard handler + command palette entry |

---

## Task 1: Zustand Store

**Files:**
- Create: `apps/tauri/src/features/settings/store.ts`

- [ ] **Step 1.1: Create the directory**

```bash
mkdir -p apps/tauri/src/features/settings/components/sections
```

- [ ] **Step 1.2: Write the store**

Create `apps/tauri/src/features/settings/store.ts`:

```typescript
import { lazy } from "react";
import { create } from "zustand";

export type SettingsGroup = "options" | "core-plugins" | "community-plugins";

export interface SectionDef {
  id: string;
  label: string;
  group: SettingsGroup;
  component: React.LazyExoticComponent<React.ComponentType>;
}

interface SettingsStore {
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

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
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
```

- [ ] **Step 1.3: Commit**

```bash
git add apps/tauri/src/features/settings/store.ts
git commit -m "feat(settings): add Zustand store with section registry"
```

---

## Task 2: Section Placeholder Components

**Files:**
- Create: `apps/tauri/src/features/settings/components/sections/GeneralSection.tsx`
- Create: `apps/tauri/src/features/settings/components/sections/EditorSection.tsx`
- Create: `apps/tauri/src/features/settings/components/sections/FilesLinksSection.tsx`
- Create: `apps/tauri/src/features/settings/components/sections/AppearanceSection.tsx`
- Create: `apps/tauri/src/features/settings/components/sections/HotkeysSection.tsx`

> **Can run in parallel with Task 1.** No store dependency — these are pure components.

- [ ] **Step 2.1: Write GeneralSection**

Create `apps/tauri/src/features/settings/components/sections/GeneralSection.tsx`:

```tsx
export default function GeneralSection() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 pb-4 border-b border-[--sat-border-subtle]">
        General
      </h2>
      <p className="text-sm text-[--sat-text-muted]">
        General settings — coming soon.
      </p>
    </div>
  );
}
```

- [ ] **Step 2.2: Write EditorSection**

Create `apps/tauri/src/features/settings/components/sections/EditorSection.tsx`:

```tsx
export default function EditorSection() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 pb-4 border-b border-[--sat-border-subtle]">
        Editor
      </h2>
      <p className="text-sm text-[--sat-text-muted]">
        Editor settings — coming soon.
      </p>
    </div>
  );
}
```

- [ ] **Step 2.3: Write FilesLinksSection**

Create `apps/tauri/src/features/settings/components/sections/FilesLinksSection.tsx`:

```tsx
export default function FilesLinksSection() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 pb-4 border-b border-[--sat-border-subtle]">
        Files &amp; links
      </h2>
      <p className="text-sm text-[--sat-text-muted]">
        Files &amp; links settings — coming soon.
      </p>
    </div>
  );
}
```

- [ ] **Step 2.4: Write AppearanceSection**

Create `apps/tauri/src/features/settings/components/sections/AppearanceSection.tsx`:

```tsx
export default function AppearanceSection() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 pb-4 border-b border-[--sat-border-subtle]">
        Appearance
      </h2>
      <p className="text-sm text-[--sat-text-muted]">
        Appearance settings — coming soon.
      </p>
    </div>
  );
}
```

- [ ] **Step 2.5: Write HotkeysSection**

Create `apps/tauri/src/features/settings/components/sections/HotkeysSection.tsx`:

```tsx
export default function HotkeysSection() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 pb-4 border-b border-[--sat-border-subtle]">
        Hotkeys
      </h2>
      <p className="text-sm text-[--sat-text-muted]">
        Hotkeys settings — coming soon.
      </p>
    </div>
  );
}
```

- [ ] **Step 2.6: Commit**

```bash
git add apps/tauri/src/features/settings/components/sections/
git commit -m "feat(settings): add placeholder section components"
```

---

## Task 3: SettingsNav

**Files:**
- Create: `apps/tauri/src/features/settings/components/SettingsNav.tsx`

> **Requires Tasks 1 and 2 complete** (imports store types; lazy paths must resolve).

- [ ] **Step 3.1: Write SettingsNav**

Create `apps/tauri/src/features/settings/components/SettingsNav.tsx`:

```tsx
import { cn } from "@workspace/ui/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/ui/command";
import { Separator } from "@workspace/ui/components/ui/separator";
import { type SettingsGroup, useSettingsStore } from "../store";

const GROUP_LABELS: Record<SettingsGroup, string> = {
  options: "Options",
  "core-plugins": "Core plugins",
  "community-plugins": "Community plugins",
};

const GROUP_EMPTY: Record<string, string> = {
  "core-plugins": "No core plugin settings yet",
  "community-plugins": "No community plugins installed",
};

const GROUPS: SettingsGroup[] = ["options", "core-plugins", "community-plugins"];

export function SettingsNav() {
  const { sections, activeSection, setActiveSection } = useSettingsStore();

  return (
    <Command className="flex flex-col h-full w-[210px] flex-shrink-0 rounded-none border-r border-[--sat-border-subtle] bg-[--sat-bg-secondary]">
      <div className="px-2 pt-3 pb-1">
        <CommandInput
          placeholder="Search settings..."
          autoFocus
          className="h-8 text-xs"
        />
      </div>
      <CommandList className="flex-1 max-h-none overflow-y-auto px-1 pb-4">
        <CommandEmpty className="py-4 text-center text-xs italic text-[--sat-text-muted]">
          No settings found.
        </CommandEmpty>
        {GROUPS.map((group, i) => {
          const groupSections = sections.filter((s) => s.group === group);
          return (
            <div key={group}>
              {i > 0 && (
                <Separator className="my-2 bg-[--sat-border-subtle]" />
              )}
              <CommandGroup
                heading={GROUP_LABELS[group]}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[--sat-text-subtle]"
              >
                {groupSections.length === 0 && GROUP_EMPTY[group] ? (
                  <p className="px-2 py-1.5 text-xs italic text-[--sat-text-subtle]">
                    {GROUP_EMPTY[group]}
                  </p>
                ) : (
                  groupSections.map((section) => (
                    <CommandItem
                      key={section.id}
                      value={section.label}
                      onSelect={() => setActiveSection(section.id)}
                      className={cn(
                        "cursor-pointer rounded-[4px] px-2 py-1.5 text-[13px] text-[--sat-text-muted]",
                        "data-[selected=true]:bg-[--sat-interactive-hover] data-[selected=true]:text-[--sat-text-primary]",
                        activeSection === section.id &&
                          "bg-[--sat-interactive-hover] text-[--sat-text-primary]",
                      )}
                    >
                      {section.label}
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </Command>
  );
}
```

- [ ] **Step 3.2: Commit**

```bash
git add apps/tauri/src/features/settings/components/SettingsNav.tsx
git commit -m "feat(settings): add SettingsNav with cmdk keyboard navigation"
```

---

## Task 4: SettingsPanel

**Files:**
- Create: `apps/tauri/src/features/settings/components/SettingsPanel.tsx`

> **Requires Tasks 1 and 2 complete.** Can run in parallel with Task 3.

- [ ] **Step 4.1: Write SettingsPanel**

Create `apps/tauri/src/features/settings/components/SettingsPanel.tsx`:

```tsx
import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
import { Suspense } from "react";
import { useSettingsStore } from "../store";

export function SettingsPanel() {
  const { sections, activeSection } = useSettingsStore();
  const section = sections.find((s) => s.id === activeSection);

  if (!section) return null;

  const SectionComponent = section.component as React.ElementType;

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="max-w-2xl px-12 py-8">
        <Suspense fallback={null}>
          <SectionComponent />
        </Suspense>
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 4.2: Commit**

```bash
git add apps/tauri/src/features/settings/components/SettingsPanel.tsx
git commit -m "feat(settings): add SettingsPanel with lazy section loading"
```

---

## Task 5: SettingsModal

**Files:**
- Create: `apps/tauri/src/features/settings/components/SettingsModal.tsx`

> **Requires Tasks 3 and 4 complete.**

Key implementation notes:
- `DialogContent` has default classes `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[calc(100%-2rem)] rounded-xl p-4`. Override all of these with `twMerge`-compatible classes.
- `showCloseButton={false}` — we render our own close button inside the layout.
- `onOpenChange` on `Dialog` (base-ui Root) takes `(open: boolean) => void`.

- [ ] **Step 5.1: Write SettingsModal**

Create `apps/tauri/src/features/settings/components/SettingsModal.tsx`:

```tsx
import { IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { useSettingsStore } from "../store";
import { SettingsNav } from "./SettingsNav";
import { SettingsPanel } from "./SettingsPanel";

export function SettingsModal() {
  const { isOpen, close } = useSettingsStore();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 top-0 left-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 p-0 bg-[--sat-bg-primary]"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex h-full">
          <SettingsNav />
          <SettingsPanel />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={close}
          className="absolute right-3 top-3 text-[--sat-text-muted] hover:text-[--sat-text-primary]"
          aria-label="Close settings"
        >
          <IconX size={14} />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5.2: Commit**

```bash
git add apps/tauri/src/features/settings/components/SettingsModal.tsx
git commit -m "feat(settings): add full-screen SettingsModal shell"
```

---

## Task 6: Public Index

**Files:**
- Create: `apps/tauri/src/features/settings/index.ts`

> **Requires Task 5 complete.**

- [ ] **Step 6.1: Write index.ts**

Create `apps/tauri/src/features/settings/index.ts`:

```typescript
export { SettingsModal } from "./components/SettingsModal";
export { useSettingsStore } from "./store";
export type { SectionDef, SettingsGroup } from "./store";
```

- [ ] **Step 6.2: Commit**

```bash
git add apps/tauri/src/features/settings/index.ts
git commit -m "feat(settings): export public API"
```

---

## Task 7: Wiring

**Files:**
- Modify: `apps/tauri/src/layout/ActivityBar.tsx`
- Modify: `apps/tauri/src/layout/WorkspaceView.tsx`
- Modify: `apps/tauri/src/layout/commands.tsx`

> **Requires Task 6 complete.**

- [ ] **Step 7.1: Wire ActivityBar**

Replace the entire contents of `apps/tauri/src/layout/ActivityBar.tsx`:

```tsx
import { useState } from "react";
import { ActivityBar as ActivityBarUI } from "@workspace/ui/components/activity-bar";
import { IconFolder, IconSearch, IconSettings } from "@tabler/icons-react";
import { useSettingsStore } from "../features/settings";

export function ActivityBar() {
  const [activeId, setActiveId] = useState<string>("explorer");
  const openSettings = useSettingsStore((s) => s.open);

  const topItems = [
    {
      id: "explorer",
      icon: <IconFolder size={20} stroke={1.5} />,
      label: "Explorer",
    },
    {
      id: "search",
      icon: <IconSearch size={20} stroke={1.5} />,
      label: "Search",
    },
  ];

  const bottomItems = [
    {
      id: "settings",
      icon: <IconSettings size={20} stroke={1.5} />,
      label: "Settings",
    },
  ];

  return (
    <ActivityBarUI
      topItems={topItems}
      bottomItems={bottomItems}
      activeId={activeId}
      onItemClick={(id) => {
        setActiveId(id);
        if (id === "settings") openSettings();
      }}
    />
  );
}
```

- [ ] **Step 7.2: Mount SettingsModal in WorkspaceView**

In `apps/tauri/src/layout/WorkspaceView.tsx`, add the import at the top with the other feature imports (line ~10):

```typescript
import { SettingsModal } from "../features/settings";
```

Add `<SettingsModal />` after `<QuickSwitcher onOpen={handleSearchOpen} />` (currently line 371):

```tsx
      <SearchModal onOpen={handleSearchOpen} />
      <QuickSwitcher onOpen={handleSearchOpen} />
      <SettingsModal />
    </div>
  );
}
```

- [ ] **Step 7.3: Add Cmd+, to commands.tsx**

In `apps/tauri/src/layout/commands.tsx`, add the import for settings store alongside the search store import (after line 15):

```typescript
import { useSettingsStore } from "../features/settings";
```

Add `IconSettings` to the existing tabler-icons import (line 1):

```typescript
import {
  IconFilePlus,
  IconFileSearch,
  IconPinned,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
  IconX,
  IconLayoutBoardSplit,
  IconRectangleVertical,
} from "@tabler/icons-react";
```

Add the store selector after `openSwitcher` (after line 48):

```typescript
  const openSettings = useSettingsStore((s) => s.open);
```

Add the command entry to the `commands` array after the `switcher:open` entry (after line 178):

```typescript
      {
        id: "app:open-settings",
        name: "Open Settings",
        category: "App",
        icon: <IconSettings size={16} />,
        hotkeys: ["Ctrl+,", "Meta+,"],
        callback: openSettings,
      },
```

Add `openSettings` to the `useMemo` dependency array (after `openSwitcher` in the deps array):

```typescript
    [
      hasActiveTab,
      onCloseActiveTab,
      onCloseOtherTabs,
      onCloseTabsToRight,
      onCreateNote,
      onDeleteNote,
      onSplitBottom,
      onSplitLeft,
      onSplitRight,
      onSplitTop,
      onTogglePinActiveTab,
      openSearch,
      openSettings,
      openSwitcher,
    ],
```

Add the `Cmd+,` keyboard handler inside the existing `useEffect` handler function, after the `else if (e.key === "o")` block (after line 217):

```typescript
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        openSwitcher();
      } else if (e.key === ",") {
        e.preventDefault();
        openSettings();
      }
    };
```

Update the second `useEffect`'s dependency array to include `openSettings`:

```typescript
  }, [openSearch, openSettings, openSwitcher]);
```

- [ ] **Step 7.4: Commit**

```bash
git add apps/tauri/src/layout/ActivityBar.tsx apps/tauri/src/layout/WorkspaceView.tsx apps/tauri/src/layout/commands.tsx
git commit -m "feat(settings): wire ActivityBar, WorkspaceView, and Cmd+, shortcut"
```

---

## Task 8: Lint and Typecheck

> **Requires Task 7 complete.**

- [ ] **Step 8.1: Run lint**

```bash
cd /path/to/Basalt && bun run lint
```

Expected: no errors. If biome reports issues, fix them before continuing.

- [ ] **Step 8.2: Run typecheck**

```bash
bunx tsc --noEmit
```

Expected: no errors.

Common issues to watch for:
- `React.LazyExoticComponent<React.ComponentType>` used as JSX — fixed by the `as React.ElementType` cast in `SettingsPanel.tsx`
- Missing `React` import in files using JSX — add `import React from "react"` if needed
- `onOpenChange` type mismatch — `Dialog` (base-ui Root) accepts `(open: boolean) => void`

- [ ] **Step 8.3: Smoke test**

```
1. Run: bun run dev
2. Click the settings gear icon in the ActivityBar → modal opens
3. Press Escape → modal closes
4. Press Cmd+, (macOS) or Ctrl+, → modal opens
5. Open command palette (Cmd+P) → search "Open Settings" → select → modal opens
6. Type "edi" in the search input → only "Editor" remains visible
7. Press ↓ → focus moves to next nav item
8. Press Enter → right panel switches to that section
9. Click each of the 5 Options sections → right panel updates
10. Verify Core plugins and Community plugins groups show empty state text
```

- [ ] **Step 8.4: Final commit**

```bash
git add -p  # stage any lint fixes
git commit -m "fix(settings): resolve lint and typecheck issues"
```
