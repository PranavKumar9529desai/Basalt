# ADR-037: Settings System Architecture — Unified Registry, Declarative Schema, and Obsidian-Class UX

## Status

Accepted (2026-09-08)

## Extends

- [ADR-002](002-sat-css-theme-tokens.md) (`--sat-*` CSS Custom Properties for All Colors)
- [ADR-003](003-shadcn-radix-over-raw-html.md) (shadcn/Radix Over Raw Tailwind Markup)
- [ADR-004](004-state-driven-navigation.md) (State-Driven Navigation Within the Workspace)
- [ADR-005](005-zustand-feature-state.md) (Zustand for Feature State Management)
- [ADR-018](018-registry-driven-workbench.md) (Registry-Driven Workbench)
- [ADR-036](036-core-plugin-architecture.md) (Core Plugin Architecture)

---

## Context

Settings in an Obsidian-class desktop workspace are not an auxiliary dialog; they constitute the primary configuration engine, plugin lifecycle surface, and extensibility gateway of the entire workbench. Users configure editing ergonomics, hotkeys, theme and typography tokens, file management rules, and manage core and community plugins.

### 1. The Gap: Basalt Today vs. Obsidian Reference

A direct visual and architectural audit of Basalt’s initial settings implementation against Obsidian (v1.13.7) reveals four foundational gaps:

#### A. Left Navigation Hierarchy and Polish

- **Obsidian Reference:**
  - Categorized into three distinct groups:
    1. **Options:** Core application preferences (`General`, `Appearance`, `Interface`, `Editor`, `Files and links`, `Hotkeys`, `Keychain`, `Core plugins`, `Community plugins`). Every item has a distinctive icon.
    2. **Core plugins:** Dynamically listed enabled core plugins that expose dedicated settings pages (`Backlinks`, `Canvas`, `Command palette`, `Daily notes`, `File recovery`, `Note composer`, `Page preview`, `Quick switcher`, `Sync`, `Templates`).
    3. **Community plugins:** Dynamically listed enabled community plugins (`Attachment Management`, `Calendar`, `Dataview`, etc.).
  - Search input at the top has a leading magnifying glass icon, keyboard focus shortcuts, and deep search capabilities.
- **Basalt Today:**
  - Text-only sidebar without icons.
  - Hardcoded navigation array in `store.ts`.
  - Static empty state placeholders (_"No core plugin settings yet"_, _"No community plugins installed"_) that did not reflect dynamically registered core plugins (like Templates and Daily Notes).
  - Search input was purely visual with no deep filtering across settings items.

#### B. Setting Item Layout and Visual Rhythm

- **Obsidian Reference:**
  - Uses an exact two-column horizontal layout per setting item (`.setting-item`):
    - **Left column (`setting-item-info`):** Setting name (medium font, high contrast) and setting description (muted color, relaxed line height, supporting inline markdown links for help docs).
    - **Right column (`setting-item-control`):** Action widget aligned to the right. Widgets include:
      - **Toggle switch:** For booleans (e.g., _Automatic updates_).
      - **Select / Dropdown:** For enumerated choices (e.g., _Language: English_).
      - **Button / Button Group:** For actions (e.g., _Check for updates_, _Log in / Sign up_, _Activate / Purchase_).
      - **Text / Number Input:** For strings/numbers (e.g., folder paths, date formats).
      - **Slider:** For ranges (e.g., font size, zoom).
      - **Color Picker:** For theme accent color.
      - **Hotkey Recorder:** For shortcut assignment.
  - Sub-section headings (`h3`, e.g., "Account", "Advanced") divide long pages into readable clusters.
  - Subtle divider line (`border-b border-[var(--sat-layout-border)]`) separates rows.
- **Basalt Today:**
  - `SettingsFields.tsx` stacked elements vertically: label on top, description in the middle, and full-width text input on the bottom.
  - Only supported string text inputs; zero support for switches, dropdowns, buttons, sliders, or sub-headings.

#### C. Extensibility & Core Plugin Integration

- In Obsidian, when a user enables a core plugin (e.g., Templates, Canvas, Backlinks) in the _Core plugins_ manager, that plugin's settings tab instantly appears under the "Core plugins" sidebar group. Disabling the plugin instantly removes the tab.
- In Basalt, plugins had no uniform registration hook to add settings tabs dynamically without editing core settings files.

#### D. Multi-Tier Persistence

- Settings lacked an explicit boundary between:
  - **Global / Machine settings:** UI theme, accent color, hardware acceleration, check for updates.
  - **Vault / Workspace settings:** Attachment paths, template folder, daily note format, enabled plugins.

---

## Decision

We adopt a **Registry-Driven, Declarative + Component Hybrid Settings Architecture** for Basalt. This brings complete visual, functional, and architectural parity with Obsidian, while remaining compliant with Basalt's four-layer architecture, `--sat-*` design tokens ([ADR-002](002-sat-css-theme-tokens.md)), and shadcn/Radix component rules ([ADR-003](003-shadcn-radix-over-raw-html.md)).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SettingsModal (Shell)                            │
│  ┌───────────────────────────┐  ┌────────────────────────────────────────┐  │
│  │        SettingsNav        │  │             SettingsPanel              │  │
│  │ ┌───────────────────────┐ │  │ ┌────────────────────────────────────┐ │  │
│  │ │ 🔍 Search settings...  │ │  │ │ Header: Title + Description       │ │  │
│  │ └───────────────────────┘ │  │ ├────────────────────────────────────┤ │  │
│  │                           │  │ │ SettingHeading ("Account")         │ │  │
│  │ OPTIONS                   │  │ ├────────────────────────────────────┤ │  │
│  │  ⚙️ General               │  │ │ SettingItem                        │ │  │
│  │  🎨 Appearance            │  │ │  - Name & Description (Left)       │ │  │
│  │  🖥️ Interface             │  │ │  - Switch / Dropdown / Btn (Right) │ │  │
│  │  📝 Editor                │  │ ├────────────────────────────────────┤ │  │
│  │  📁 Files and links       │  │ │ SettingItem                        │ │  │
│  │  ⌘  Hotkeys               │  │ │  - Name & Description (Left)       │ │  │
│  │  🧩 Core plugins          │  │ │  - Text Input / Slider (Right)     │ │  │
│  │  👥 Community plugins     │  │ ├────────────────────────────────────┤ │  │
│  │                           │  │ │ SettingHeading ("Advanced")        │ │  │
│  │ CORE PLUGINS              │  │ ├────────────────────────────────────┤ │  │
│  │  🔗 Backlinks             │  │ │ SettingItem ...                    │ │  │
│  │  🔲 Canvas                │  │ └────────────────────────────────────┘ │  │
│  │  📅 Daily notes           │  │                                        │  │
│  │  📋 Templates             │  │                                        │  │
│  └───────────────────────────┘  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Settings Tab Registry (`settingsRegistry`)

To eliminate hardcoded section arrays and satisfy [ADR-018](018-registry-driven-workbench.md) and [ADR-036](036-core-plugin-architecture.md), settings tabs register dynamically.

#### Type Contract (`features/settings/lib/registry.ts`)

```typescript
export type SettingsGroup = "options" | "core-plugins" | "community-plugins";

export interface SettingSectionDef {
  /** Unique section id, e.g. "general", "editor", "templates", "dailies" */
  id: string;
  /** Human-readable title displayed in the left nav */
  label: string;
  /** Navigation category */
  group: SettingsGroup;
  /** Tabler icon component rendered in the navigation row */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Ordering weight within the group (lower numbers sort first) */
  order?: number;
  /** Owning plugin ID if this section belongs to a core or community plugin */
  pluginId?: string;
  /** Dynamic predicate: if provided and returns false, section is hidden */
  isEnabled?: () => boolean;
  /**
   * Custom React component for complex settings tabs (e.g. Hotkeys, Appearance, CorePlugins).
   * Lazy-loaded via React.lazy().
   */
  component?:
    React.LazyExoticComponent<React.ComponentType> | React.ComponentType;
  /**
   * Declarative item specifications. If component is omitted, SettingsPanel renders
   * these items automatically using standard SettingItem rows.
   */
  specs?: SettingItemSpec[];
}
```

#### Lifecycle Behavior:

- **Core Plugins:** When a plugin is loaded/enabled in the workbench, it calls `settingsRegistry.register(...)`.
- **Plugin Toggle:** When a plugin is disabled via the _Core plugins_ or _Community plugins_ manager, it unregisters its section via `settingsRegistry.unregister(id)`. If the user currently had that section open, `activeSection` automatically falls back to `"general"`.

---

### 2. Declarative Schema System (`SettingItemSpec`)

80% of settings screens are structured lists of standard controls. To prevent boilerplate across plugins and maintain strict visual uniformity, sections can declare their fields using `SettingItemSpec`:

```typescript
export type SettingControlType =
  | "toggle" // Boolean switch
  | "text" // Text input
  | "number" // Number input
  | "dropdown" // Select dropdown
  | "slider" // Range slider
  | "button" // Single button
  | "button-group" // Multiple buttons (e.g. Log in + Sign up)
  | "color"; // Accent color picker

export interface SettingOption {
  label: string;
  value: string;
}

export interface SettingButtonSpec {
  text: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}

export interface SettingItemSpec {
  /** Unique store key in SettingsStore (optional for stateless action buttons) */
  key?: string;
  /** Setting title */
  name: string;
  /** Setting description; supports ReactNode for rich text and documentation links */
  description?: React.ReactNode;
  /** If present, renders a SettingHeading sub-section divider above this item */
  heading?: string;
  /** Heading subtext if heading is specified */
  headingDescription?: string;
  /** Interactive control widget type */
  type: SettingControlType;
  /** Placeholder for text/number inputs */
  placeholder?: string;
  /** Options list for dropdown type */
  options?: SettingOption[];
  /** Min, max, step for slider / number types */
  min?: number;
  max?: number;
  step?: number;
  /** Button specification for "button" type */
  button?: SettingButtonSpec;
  /** Button array for "button-group" type */
  buttons?: SettingButtonSpec[];
  /** Keywords to assist search indexing */
  keywords?: string[];
  /** Disabled state or predicate */
  disabled?: boolean | (() => boolean);
  /** Custom change handler if intercepting or transforming values */
  onChange?: (value: unknown) => void;
}
```

---

### 3. Visual Primitives & Obsidian Layout Parity

To satisfy [ADR-003](003-shadcn-radix-over-raw-html.md) and [ADR-002](002-sat-css-theme-tokens.md), all UI elements are built from modular, stateless primitives styled via `--sat-*` tokens.

#### 3.1 Two-Column Setting Item (`SettingItem.tsx`)

The structural building block of every settings page:

```tsx
export function SettingItem({
  name,
  description,
  children,
  className,
}: SettingItemProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-3.5 border-b border-[var(--sat-layout-border)] last:border-b-0 gap-6",
        className,
      )}
    >
      {/* Left: Info */}
      <div className="flex flex-col flex-1 min-w-0 pr-4">
        <span className="text-sm font-medium text-[var(--sat-text-primary)] select-none">
          {name}
        </span>
        {description && (
          <div className="text-xs text-[var(--sat-text-muted)] mt-0.5 leading-relaxed">
            {description}
          </div>
        )}
      </div>

      {/* Right: Control Widget */}
      <div className="flex items-center justify-end flex-shrink-0 gap-2 min-w-0">
        {children}
      </div>
    </div>
  );
}
```

#### 3.2 Sub-Section Heading (`SettingHeading.tsx`)

Used to partition settings into distinct functional groups:

```tsx
export function SettingHeading({ title, description }: SettingHeadingProps) {
  return (
    <div className="mt-8 mb-3 pt-4 border-t border-[var(--sat-layout-border)] first:mt-0 first:pt-0 first:border-t-0">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--sat-text-secondary)]">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-[var(--sat-text-muted)] mt-1">
          {description}
        </p>
      )}
    </div>
  );
}
```

#### 3.3 Control Widgets

- **Switch / Toggle:** Accessible boolean toggle with `--sat-accent-primary` track background when checked and smooth thumb sliding.
- **Select / Dropdown:** Styled custom dropdown or system select using `--sat-surface-2` and `--sat-layout-border`.
- **Button / Button Group:** Standard `@workspace/ui/components/ui/button` components using `sm` sizing.
- **Text / Number Input:** `@workspace/ui/components/ui/input` with max-width bounding (e.g. `max-w-[240px]`).
- **Slider:** Range input with numeric readout beside the thumb.

---

### 4. Navigation & Sidebar Architecture (`SettingsNav.tsx`)

1. **Header Search Input:**
   - Leading search icon (`IconSearch`).
   - Placeholder: `"Search settings..."`.
   - Real-time filtering with instant clearance (`Escape` or `X` button).
2. **Section Group Rendering:**
   - **Options:** General, Appearance, Interface, Editor, Files and links, Hotkeys, Core plugins, Community plugins.
   - **Core plugins:** Only visible when core plugins are active and provide settings tabs.
   - **Community plugins:** Only visible when community plugins are active.
   - Empty state fallback text: _"No core plugin settings yet"_ / _"No community plugins installed"_.
3. **Item Row Styling:**
   - Distinct icon + title per row.
   - Active state: pill highlight (`bg-[var(--sat-accent-primary)]/10 text-[var(--sat-accent-primary)] font-medium`).
   - Hover state: subtle surface elevation (`hover:bg-[var(--sat-surface-2)]`).

---

### 5. Search & Deep-Filter Subsystem

Users must be able to find any setting instantly without knowing which tab contains it.

#### Indexing & Filtering Pipeline

1. **Search Index:** A memoized flat index maps every setting item (from both declarative `specs` and registered sections) into searchable records:
   ```typescript
   interface SearchIndexEntry {
     sectionId: string;
     sectionLabel: string;
     itemName: string;
     itemDescription?: string;
     keywords: string[];
   }
   ```
2. **Sidebar Response:**
   - Sections containing matching items remain visible and display a count badge (e.g., `General (2)`, `Editor (5)`).
   - Non-matching sections are hidden during search.
3. **Panel Response:**
   - Inside the active section, items that do not match the query are filtered out.
   - Matched substrings in item names and descriptions are highlighted.

---

### 6. Multi-Tier Persistence Model

Settings are partitioned into three clean tiers of persistence:

| Tier               | Scope                | Storage Backend                  | IPC Methods                               | Canonical Examples                                                           |
| ------------------ | -------------------- | -------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| **Tier 1: Global** | App-wide (Machine)   | `config.json` in OS app-data     | `get_settings`, `set_setting`             | UI theme, accent color, font size, update check, hardware acceleration       |
| **Tier 2: Vault**  | Per-vault workspace  | `.basalt/settings.json` in vault | `get_vault_settings`, `set_vault_setting` | Template folder, daily notes format, attachment folder, enabled core plugins |
| **Tier 3: Plugin** | Plugin private state | `.basalt/plugins/<id>/data.json` | Plugin storage APIs                       | Plugin-specific cache, custom query presets                                  |

#### Reactivity Contract

- Changes update the frontend Zustand store **optimistically** (0ms latency).
- Updates are written to the Rust backend asynchronously in the background.
- UI components subscribe to specific setting keys via `useSetting(key)`.

---

### 7. Specifications for Core Sections

#### A. General (`GeneralSection.tsx`)

- App version display with `"Check for updates"` button.
- Toggle: _Automatic updates_.
- Toggle: _Receive early access versions_.
- Dropdown: _Language_ (e.g. English).
- Action: _Help_ ("Open" button to documentation/community).
- Section `Account`: Account status display with _Log in_ and _Sign up_ buttons.
- Section `Commercial license`: License status with _Activate_ and _Purchase_ buttons.

#### B. Appearance (`AppearanceSection.tsx`)

- Base color scheme: _Dark_ / _Light_ / _Adapt to system_ (radio/dropdown cards).
- Accent color: Swatches for presets (Purple, Blue, Emerald, Amber, Rose) + custom hex input.
- Typography:
  - Font family override input.
  - Font size slider (12px to 24px) with live preview.
- UI Zoom level slider (80% to 150%).

#### C. Editor (`EditorSection.tsx`)

- Default view mode: _Live preview_ vs _Reading view_.
- Toggles:
  - _Readable line length_ (centers prose within comfortable line width).
  - _Strict line breaks_ (CommonMark line break rules).
  - _Line numbers_ (show line numbers in gutter).
  - _Fold heading and indentation_.
  - _Auto-pair brackets and quotes_.
  - _Vim keybindings mode_.
- Dropdown: _Tab size_ (2 spaces, 4 spaces, Tab).

#### D. Files & Links (`FilesLinksSection.tsx`)

- Default location for new notes: _Vault root_, _Same folder as current note_, _In specified folder_.
- Text Input: _Default folder path_.
- Dropdown: _New link format_ (_Wikilink [[note]]_ vs _Markdown [note](note.md)_).
- Toggle: _Auto-update internal links on rename_.
- Text Input: _Attachment folder path_ (default `_attachments`).
- Dropdown: _Attachment organization_ (Flat, By note, By type, By date).

#### E. Hotkeys (`HotkeysSection.tsx`)

- Search filter input to filter commands by name or keybinding.
- Table virtualized with `@tanstack/react-virtual`.
- Interactive hotkey recorder:
  - Click hotkey button → prompt _"Press desired shortcut"_.
  - Listens for key events, normalizes modifiers (`Ctrl`/`Cmd`, `Alt`, `Shift`).
  - Conflict detection alerting if keybinding collides with existing command.
  - _Reset to default_ and _Unbind_ actions.

#### F. Core Plugins Manager (`CorePluginsSection.tsx`)

- Manager tab listed under "Options".
- Renders cards/rows for each core plugin:
  - Templates, Daily notes, Backlinks, Canvas, Graph view, Quick switcher, Command palette.
  - Each item has: Icon, Name, Description, Settings Gear button (jumps directly to its tab), and master Toggle Switch.

---

### 8. Modular Directory & File Architecture

To keep the settings feature maintainable, extensible, and scalable as dozens of plugins and configuration pages are added, the filesystem is partitioned into strict, single-responsibility directories:

```
apps/tauri/src/features/settings/
├── index.ts                      # Public barrel: SettingsModal, useSetting, setSetting, types
├── types.ts                      # Domain types: SettingSectionDef, SettingItemSpec, SettingGroup
├── store.ts                      # Modal state: isOpen, activeSection, searchQuery, activeTab
├── lib/
│   ├── settings-data.ts          # KV store: DEFAULTS, useSetting, setSetting, initSettings
│   ├── registry.ts               # Dynamic registry: settingsRegistry (register/unregister/getAll)
│   ├── registrations.ts          # Boot-time section registrations (side-effect import)
│   └── appearance-effects.ts     # Applies accent/font/zoom to --sat-* tokens
├── commands.ts                   # Palette command wiring: app:open-settings
│
├── specs/                        # Declarative specifications per domain
│   ├── index.ts                  # Aggregated specs map & search indexer
│   ├── general.ts                # General options specs
│   ├── appearance.ts             # Appearance options specs
│   ├── editor.ts                 # Editor options specs
│   ├── filesLinks.ts             # Files & links options specs
│   ├── templates.ts              # Templates core plugin specs
│   └── dailies.ts                # Daily notes core plugin specs
│
└── components/                   # React UI components
    ├── SettingsModal.tsx         # Root modal container & backdrop
    ├── SettingsNav.tsx           # Left navigation bar with search input & categories
    ├── SettingsPanel.tsx         # Right content panel
    │
    ├── layout/                   # Presentational layout primitives (Obsidian parity)
    │   ├── SettingItem.tsx       # Standard 2-column setting row
    │   ├── SettingHeading.tsx    # Sub-heading section divider
    │   ├── SettingsFields.tsx    # Automatic spec form renderer
    │   └── SettingsSearch.tsx    # Nav search input with icon & clear button
    │
    ├── controls/                 # Modular setting control widgets
    │   ├── index.ts              # Barrel export for controls
    │   ├── SettingToggle.tsx     # Boolean switch
    │   ├── SettingDropdown.tsx   # Select dropdown
    │   ├── SettingInput.tsx      # Text/number input
    │   ├── SettingButton.tsx     # Action button(s)
    │   └── SettingSlider.tsx     # Range slider with value display
    │
    └── sections/                 # Sections organized by category
        ├── options/              # Core app option pages
        │   ├── GeneralSection.tsx
        │   ├── AppearanceSection.tsx
        │   ├── EditorSection.tsx
        │   ├── FilesLinksSection.tsx
        │   ├── HotkeysSection.tsx
        │   ├── CorePluginsSection.tsx
        │   └── CommunityPluginsSection.tsx
        │
        └── plugins/              # Core plugin settings pages
            ├── TemplatesSection.tsx
            ├── DailyNotesSection.tsx
            ├── CanvasSection.tsx
            └── BacklinksSection.tsx
```

#### File Budget & Responsibility Invariants:

1. **Zero Monolithic Files:** No settings file exceeds 200 lines. Heavy forms use modular `specs/` files.
2. **Strict Presentational Separation:** Components in `components/layout/` and `components/controls/` are stateless, receiving props and emitting callbacks.
3. **No Direct Deep Cross-Imports:** Plugins and shell import only from `features/settings` (or `types.ts` for typings).

---

## Non-goals

1. **Native OS Multi-Window Popout (v1):** Settings renders as an in-app modal overlay inside the primary Tauri window, not as a separate OS-level window.
2. **Cloud Sync Backend (v1):** The Account and License sections match Obsidian's UI layout as design placeholders; backend auth/sync infrastructure is deferred to dedicated cloud milestones.
3. **Arbitrary CSS Injection Sandbox:** Custom CSS snippet loading will follow a dedicated security ADR before allowing arbitrary CSS execution.

---

## Consequences

- **Total Obsidian Visual & Functional Parity:** Basalt gets the exact two-column, clean rhythm, categorized sidebar, and rich widget support seen in Obsidian 1.13.7.
- **Zero-Boilerplate Plugin Settings:** New core and community plugins define `specs: SettingItemSpec[]` and receive fully-styled, accessible, searchable settings tabs with zero React UI code.
- **Fast, Unified Search:** Settings can be searched globally across tabs and individual fields without lag.
- **Strict Architecture Compliance:** Conforms to four-layer downward dependency rules, ADR-002 tokens, ADR-003 primitives, and ADR-018 registry patterns.
