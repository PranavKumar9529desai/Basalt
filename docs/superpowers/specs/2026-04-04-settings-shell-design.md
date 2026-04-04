# Settings Shell — Design Spec

**Date:** 2026-04-04  
**Status:** Approved  
**Scope:** Shell only — modal layout, left nav, section registry. No settings content.

---

## What We're Building

A full-screen overlay settings modal, identical in UX to Obsidian's settings panel. The shell is built to be extensible: community plugins will be able to register their own settings sections via a Zustand registry without touching core code.

Individual settings content (General form, Editor form, etc.) is **out of scope** — each section gets a placeholder panel now, filled in step-by-step later.

---

## Architecture

### Feature Location

```
apps/tauri/src/features/settings/
├── store.ts
├── components/
│   ├── SettingsModal.tsx
│   ├── SettingsNav.tsx
│   ├── SettingsPanel.tsx
│   └── sections/
│       ├── GeneralSection.tsx      ← placeholder
│       ├── EditorSection.tsx       ← placeholder
│       ├── FilesLinksSection.tsx   ← placeholder
│       ├── AppearanceSection.tsx   ← placeholder
│       └── HotkeysSection.tsx      ← placeholder
└── index.ts
```

Everything is feature-local. Nothing moves to `packages/ui` — the shell is not generic enough to reuse elsewhere yet.

---

## Store

```typescript
// features/settings/store.ts

type SettingsGroup = 'options' | 'core-plugins' | 'community-plugins';

interface SectionDef {
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
  registerSection: (def: SectionDef) => void;    // plugin entry point
  unregisterSection: (id: string) => void;       // plugin cleanup on unload
}
```

Core sections (`general`, `editor`, `files-links`, `appearance`, `hotkeys`) are **pre-populated in the store initialiser** — not registered dynamically. `registerSection` / `unregisterSection` are reserved for runtime plugin use.

The store initialises with `activeSection: 'general'` and `isOpen: false`.

---

## Component Tree

```
WorkspaceView
└── <SettingsModal />        ← mounted as sibling to SearchModal / QuickSwitcher

SettingsModal
└── Dialog (shadcn — handles focus trap, Escape key, backdrop)
    └── DialogContent (fixed inset-0, full-screen, no border-radius)
        ├── DialogTitle (sr-only — accessibility)
        └── flex row (h-full)
            ├── SettingsNav     (w-[210px], border-r)
            └── SettingsPanel   (flex-1)

SettingsNav
└── Command (cmdk — keyboard nav context)
    ├── CommandInput (placeholder: "Search settings...")
    └── CommandList (flex-1, max-h-none, overflow-y-auto)
        ├── CommandGroup heading="Options"
        │   ├── CommandItem → General
        │   ├── CommandItem → Editor
        │   ├── CommandItem → Files & links
        │   ├── CommandItem → Appearance
        │   └── CommandItem → Hotkeys
        ├── Separator
        ├── CommandGroup heading="Core plugins"
        │   └── CommandEmpty: "No core plugin settings yet"
        ├── Separator
        └── CommandGroup heading="Community plugins"
            └── CommandEmpty: "No community plugins installed"

SettingsPanel
└── ScrollArea (flex-1, h-full)
    └── div (px-12 py-8)
        └── Suspense → <ActiveSection.component />
```

The nav renders `sections[]` from the store grouped by `group`. When a plugin calls `registerSection()`, a new `CommandItem` appears automatically — no nav code changes required.

---

## shadcn Components Used

| Part | Component | Source |
|---|---|---|
| Modal overlay + focus trap + Escape | `Dialog`, `DialogContent`, `DialogTitle` | `packages/ui/src/components/ui/dialog.tsx` |
| Left nav with keyboard nav + search filter | `Command`, `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`, `CommandEmpty` | `packages/ui/src/components/ui/command.tsx` |
| Right panel scroll | `ScrollArea` | `packages/ui/src/components/ui/scroll-area.tsx` |
| Group dividers | `Separator` | `packages/ui/src/components/ui/separator.tsx` |
| Close button | `Button` | `packages/ui/src/components/ui/button.tsx` |

No new shadcn components need to be installed.

**Required className overrides (not component modifications):**
- `DialogContent`: add `max-w-none rounded-none p-0 border-0` to go full-screen
- `CommandList`: add `max-h-none` to remove shadcn's default height cap

---

## Keyboard Behaviour

| Key | Action |
|---|---|
| `Escape` | Close modal (handled by Radix Dialog) |
| `Cmd+,` (macOS) / `Ctrl+,` (Windows/Linux) | Open modal, focus `CommandInput` |
| `↑` / `↓` | Navigate between nav items (handled by cmdk) |
| `Enter` | Select focused nav item → `setActiveSection()` |
| Typing in nav | Filters section labels live (handled by cmdk) |

Focus lands on `CommandInput` when the modal opens (`autoFocus` on the input, or `cmd.focus()` on open).

---

## Entry Points

**ActivityBar** — the settings icon already exists in `ActivityBar.tsx`. Wire its `onItemClick` for `"settings"` to call `useSettingsStore().open()`.

**Keyboard shortcut** — register `Cmd+,` in `AppCommands` (same pattern as `Cmd+F`, `Cmd+O`).

**Command palette** — register a `"Open settings"` command in the command registry.

---

## Mounting

`<SettingsModal />` mounts in `WorkspaceView` as a sibling to `<SearchModal />` and `<QuickSwitcher />`:

```tsx
// WorkspaceView.tsx additions
import { SettingsModal } from '@/features/settings';

// In JSX:
<SettingsModal />
```

No props — the modal reads all state from `useSettingsStore()` directly.

---

## Styling Tokens

All colours use `--sat-*` CSS custom properties. No hardcoded hex values.

| Element | Token |
|---|---|
| Left nav background | `--sat-bg-secondary` |
| Right panel background | `--sat-bg-primary` |
| Active nav item background | `--sat-interactive-hover` |
| Active nav item text | `--sat-text-primary` |
| Inactive nav item text | `--sat-text-muted` |
| Group header text | `--sat-text-subtle` |
| Nav border-right | `--sat-border-subtle` |
| Backdrop | `rgba(0,0,0,0.6)` + `backdrop-blur-sm` |
| Accent (active indicator) | `--sat-accent-primary` |

---

## Section Placeholder Shape

Each section component is a lazy-loaded placeholder:

```tsx
// sections/GeneralSection.tsx
export default function GeneralSection() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 pb-4 border-b border-[--sat-border-subtle]">
        General
      </h2>
      <p className="text-[--sat-text-muted] text-sm">
        General settings — coming soon.
      </p>
    </div>
  );
}
```

All five sections follow this identical shape. Content is filled in future steps.

---

## Out of Scope

- Any actual settings content (form fields, toggles, values)
- IPC reads/writes (`get_settings`, `set_setting`) — added per-section in future steps
- Hotkeys rebinding UI
- Plugin system
- Per-vault settings (workspace.json tier) — future step

---

## Success Criteria

- Settings modal opens from ActivityBar click, `Cmd+,`, and command palette
- `Escape` closes the modal
- All five Options sections appear in the left nav and are selectable
- Core plugins and Community plugins group headers render with empty states
- Typing in the `CommandInput` filters visible sections live
- `↑ ↓ Enter` keyboard navigation works within the left nav
- All colours use `--sat-*` tokens (no hardcoded values)
- `bun run lint && bunx tsc --noEmit` passes with no errors
