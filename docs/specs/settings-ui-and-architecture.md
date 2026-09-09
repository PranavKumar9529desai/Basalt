# Basalt Settings UI & Architecture Specification

> Companion to [ADR-037: Settings System Architecture](../adr/037-settings-system-architecture.md).  
> Exhaustive implementation blueprint for building Obsidian-class Settings in Basalt.

---

## 1. Visual & Spatial Hierarchy

This section documents the exact visual and spatial rules derived from the Obsidian 1.13.7 reference layout and Basalt design tokens.

### 1.1 Modal Shell Dimensions & Backdrop

- **Backdrop:** `fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]`
- **Modal Container:**
  - `w-[85vw] max-w-[1080px] min-w-[760px] h-[85vh] max-h-[820px] min-h-[520px]`
  - `rounded-xl overflow-hidden shadow-2xl flex border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)]`
- **Close Button:**
  - Absolute top-right: `absolute right-3.5 top-3.5 z-20`
  - Ghost icon button (`IconX`, size 16), rounded, text `var(--sat-text-muted)` hover `var(--sat-text-primary)`

### 1.2 Two-Pane Layout

```
+--------------------------+------------------------------------------------+
|  SettingsNav (240px)     |  SettingsPanel (flex-1)                        |
|                          |                                                |
|  [Q Search settings... ] |  H2 Section Title                              |
|                          |  Subtitle / description text                   |
|  OPTIONS                 |  --------------------------------------------  |
|    General               |                                                |
|    Appearance            |  H3 Sub-heading (e.g. "Account")               |
|    Interface             |  --------------------------------------------  |
|    Editor                |  Setting Name                   [ Control ]    |
|    Files and links       |  Description text with link                    |
|    Hotkeys               |  --------------------------------------------  |
|    Core plugins          |  Setting Name                   [ Toggle  ]    |
|    Community plugins     |  Description text                              |
|                          |  --------------------------------------------  |
|  CORE PLUGINS            |  Setting Name                   [ Dropdown v ] |
|    Backlinks             |  Description text                              |
|    Canvas                |                                                |
|    Daily notes           |                                                |
|    Templates             |                                                |
+--------------------------+------------------------------------------------+
```

---

## 2. Left Navigation (`SettingsNav.tsx`)

### 2.1 Search Input

- Container: `p-3 border-b border-[var(--sat-layout-border)]`
- Input wrapper: `relative flex items-center`
  - Leading icon: `IconSearch` (size 14), left: `left-2.5`, color: `var(--sat-text-muted)`
  - Input: `h-8 pl-8 pr-7 text-xs bg-[var(--sat-surface-1)] border-[var(--sat-layout-border)] rounded-md focus:ring-1 focus:ring-[var(--sat-accent-primary)]`
  - Clear button: `IconX` (size 12), right: `right-2`, visible when query is non-empty, clears query and refocuses input.

### 2.2 Category Groups

Sidebar uses three uppercase groups with `text-[11px] font-semibold text-[var(--sat-text-muted)] tracking-wider px-3 pt-4 pb-1.5 select-none`:

1. **`OPTIONS`**
   - Built-in configuration tabs:
     - `General` (`IconSettings` / `IconUser`, size 15)
     - `Appearance` (`IconPalette`, size 15)
     - `Interface` (`IconLayout`, size 15)
     - `Editor` (`IconFileText`, size 15)
     - `Files and links` (`IconFolder`, size 15)
     - `Hotkeys` (`IconKeyboard`, size 15)
     - `Core plugins` (`IconPuzzle`, size 15) — _Plugin manager tab_
     - `Community plugins` (`IconUsers`, size 15) — _Community manager tab_
2. **`CORE PLUGINS`**
   - Populated dynamically by active core plugins that declare settings.
   - Example items: `Backlinks` (`IconLink`), `Canvas` (`IconLayoutGrid`), `Command palette` (`IconTerminal2`), `Daily notes` (`IconCalendar`), `Quick switcher` (`IconArrowsExchange`), `Templates` (`IconClipboardList`).
   - If no core plugins with settings are active: shows italic muted text `No core plugin settings yet`.
3. **`COMMUNITY PLUGINS`**
   - Populated dynamically by active third-party plugins with settings.
   - Empty state: `No community plugins installed`.

### 2.3 Navigation Item Styling

- Row container: `group flex items-center gap-2.5 px-3 py-1.5 mx-2 my-0.5 rounded-md cursor-pointer text-xs transition-colors select-none`
- **Default:** `text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-2)] hover:text-[var(--sat-text-primary)]`
- **Active:** `bg-[var(--sat-accent-primary)]/12 text-[var(--sat-accent-primary)] font-medium`
- **Icon:** Inherits text color, fixed `w-4 h-4 flex-shrink-0 flex items-center justify-center`
- **Badge (Search Mode):** Pill `ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--sat-surface-3)] text-[var(--sat-text-muted)] font-mono`

---

## 3. Right Content Area (`SettingsPanel.tsx`)

### 3.1 Content Container & Header

- Wrapper: `ScrollArea className="flex-1 h-full bg-[var(--sat-surface-1)]"`
- Inner container: `max-w-3xl px-10 py-7 mx-auto`
- Section Title (`h2`): `text-xl font-semibold text-[var(--sat-text-primary)] tracking-tight`
- Section Description: `text-xs text-[var(--sat-text-muted)] mt-1.5 mb-6 leading-relaxed`
- Bottom divider: `border-b border-[var(--sat-layout-border)] pb-6 mb-6`

### 3.2 Sub-Heading (`SettingHeading`)

```tsx
<div className="mt-8 mb-2 pt-4 border-t border-[var(--sat-layout-border)] first:mt-0 first:pt-0 first:border-t-0">
  <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--sat-text-secondary)]">
    {title}
  </h3>
  {description && (
    <p className="text-xs text-[var(--sat-text-muted)] mt-1">{description}</p>
  )}
</div>
```

### 3.3 Standard Setting Row (`SettingItem`)

The structural building block matching Obsidian:

```tsx
<div className="flex items-center justify-between py-3.5 border-b border-[var(--sat-layout-border)] last:border-b-0 gap-6">
  {/* Left Column: Info */}
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

  {/* Right Column: Control Widget */}
  <div className="flex items-center justify-end flex-shrink-0 gap-2 min-w-0">
    {control}
  </div>
</div>
```

---

## 4. Setting Controls Specification

All controls must be presentational primitives from `@workspace/ui` styled exclusively via `--sat-*` tokens.

### 4.1 Toggle Switch (`SettingToggle`)

- Built using Radix UI Switch primitive (`@radix-ui/react-switch`).
- Root: `w-9 h-5 rounded-full bg-[var(--sat-surface-3)] transition-colors data-[state=checked]:bg-[var(--sat-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sat-accent-primary)]`
- Thumb: `block w-3.5 h-3.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px] translate-x-[3px]`

### 4.2 Select / Dropdown (`SettingDropdown`)

- Sizing: `h-8 px-2.5 min-w-[140px] text-xs rounded-md bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)] text-[var(--sat-text-primary)] hover:border-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)]`
- Rendered with right chevron `IconChevronDown` (size 12).

### 4.3 Action Button (`SettingButton`)

- Variants:
  - Primary / CTA: `Button variant="default" size="sm"`
  - Secondary / Normal: `Button variant="outline" size="sm" className="bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)] text-xs h-7 px-3"`
  - Destructive: `Button variant="destructive" size="sm"`
- Multi-button slot: Renders buttons side-by-side with `gap-2` (e.g. `[Log in] [Sign up]` or `[Activate] [Purchase]`).

### 4.4 Text & Number Inputs (`SettingInput`)

- Sizing: `h-8 w-[220px] text-xs px-2.5 rounded-md bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)] text-[var(--sat-text-primary)] placeholder:text-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)]`
- Debounce: Text fields debounce persistence by 300ms or persist on blur.

### 4.5 Slider (`SettingSlider`)

- Sizing: `w-[160px] flex items-center gap-3`
- Track: `h-1.5 bg-[var(--sat-surface-3)] rounded-full`
- Readout: Pill with numeric value `text-xs font-mono text-[var(--sat-text-muted)] w-8 text-right`

---

## 5. Specification of Core Sections

### 5.1 General (`GeneralSection.tsx`)

1. **Version info:**
   - Name: `Version 0.1.0`
   - Description: `Installer version: 0.1.0. Read the changelog.`
   - Control: Button `Check for updates`
2. **Automatic updates:**
   - Name: `Automatic updates`
   - Description: `Turn this off to prevent the app from checking for updates.`
   - Control: Switch (key: `autoUpdates`, default: `true`)
3. **Receive early access versions:**
   - Name: `Receive early access versions`
   - Description: `Auto-update to the latest early access version.`
   - Control: Switch (key: `earlyAccess`, default: `false`)
4. **Language:**
   - Name: `Language`
   - Description: `Change the display language.`
   - Control: Dropdown (key: `language`, default: `en`, options: `[English]`)
5. **Help:**
   - Name: `Help`
   - Description: `Learn how to use Basalt and get help from the community.`
   - Control: Button `Open`
6. **Sub-heading: `Account`**
   - Name: `Your account`
   - Description: `You are not logged in right now. An account is only needed for sync and publish.`
   - Control: Buttons `[Log in] [Sign up]`
7. **Sub-heading: `Commercial license`**
   - Name: `Commercial license`
   - Description: `Help keep Basalt 100% user-supported.`
   - Control: Buttons `[Activate] [Purchase]`

### 5.2 Appearance (`AppearanceSection.tsx`)

1. **Base color scheme:**
   - Name: `Base color scheme`
   - Description: `Choose between light, dark, or follow your system preference.`
   - Control: Dropdown (key: `theme`, options: `[Dark, Light, System]`, default: `dark`)
2. **Accent color:**
   - Name: `Accent color`
   - Description: `Accent color for buttons, highlights, and active tabs.`
   - Control: Color palette picker (Purple `#7c3aed`, Blue `#2563eb`, Emerald `#059669`, Amber `#d97706`, Rose `#e11d48`)
3. **Font family:**
   - Name: `Interface font`
   - Description: `Customize the font used for the interface and editor.`
   - Control: Text input (placeholder: `Inter, sans-serif`)
4. **Font size:**
   - Name: `Font size`
   - Description: `Quickly adjust the base font size.`
   - Control: Slider (12px – 24px, default: 14px)
5. **Zoom level:**
   - Name: `Zoom level`
   - Description: `Adjust the scale of the entire interface.`
   - Control: Slider (80% – 150%, default: 100%)

### 5.3 Editor (`EditorSection.tsx`)

1. **Default view mode:**
   - Name: `Default view mode for new tabs`
   - Description: `Choose between live preview editor and reading view.`
   - Control: Dropdown (Live preview / Reading view)
2. **Readable line length:**
   - Name: `Readable line length`
   - Description: `Center and limit text line width for reading comfort.`
   - Control: Switch (key: `readableLineLength`, default: `true`)
3. **Strict line breaks:**
   - Name: `Strict line breaks`
   - Description: `A single line break will not create a new paragraph unless ended with two spaces.`
   - Control: Switch (key: `strictLineBreaks`, default: `false`)
4. **Line numbers:**
   - Name: `Show line numbers`
   - Description: `Display line numbers in the editor gutter.`
   - Control: Switch (key: `showLineNumbers`, default: `true`)
5. **Fold heading and indent:**
   - Name: `Fold heading`
   - Description: `Allow collapsing sections underneath Markdown headings.`
   - Control: Switch (key: `foldHeading`, default: `true`)
6. **Auto-pair brackets and quotes:**
   - Name: `Auto-pair brackets and quotes`
   - Description: `Automatically close brackets and markdown formatting pairs.`
   - Control: Switch (key: `autoPairBrackets`, default: `true`)
7. **Tab size:**
   - Name: `Tab indent size`
   - Description: `Number of spaces per indentation level.`
   - Control: Dropdown (2 spaces, 4 spaces, Tab)
8. **Vim mode:**
   - Name: `Vim key bindings`
   - Description: `Enable modal editing using Vim keybindings.`
   - Control: Switch (key: `vimMode`, default: `false`)

### 5.4 Files & Links (`FilesLinksSection.tsx`)

1. **Default location for new notes:**
   - Name: `Default location for new notes`
   - Description: `Where newly created notes are saved.`
   - Control: Dropdown (Vault root / Same folder as current note / Specified folder)
2. **New link format:**
   - Name: `New link format`
   - Description: `How new internal links are formatted.`
   - Control: Dropdown (`[[Wikilink]]` vs `[Markdown](file.md)`)
3. **Auto-update links:**
   - Name: `Automatically update internal links`
   - Description: `Update links inside all notes when a note is renamed or moved.`
   - Control: Switch (key: `autoUpdateLinks`, default: `true`)
4. **Attachment folder:**
   - Name: `Attachment folder path`
   - Description: `Folder where pasted or dragged attachments are stored.`
   - Control: Text input (key: `attachmentFolder`, default: `_attachments`)
5. **Attachment organization:**
   - Name: `Attachment organization`
   - Description: `How attachments are arranged inside the attachment folder.`
   - Control: Dropdown (Flat / By note / By date / By type)

### 5.5 Hotkeys (`HotkeysSection.tsx`)

- Top search filter input (`Search hotkeys...`).
- Virtualized list of all commands from `commandService.getAllCommands()`.
- Each row contains:
  - Command Name + Plugin/Category tag.
  - Assigned Hotkey Pill (e.g. `Ctrl` + `P`).
  - Button `Customize` (activates keystroke recording modal).
  - Button `Reset` / `Unbind`.

### 5.6 Core Plugins Manager (`CorePluginsSection.tsx`)

- Renders a master list of all first-party core plugins:
  - `Backlinks` (Backlinks dock view and note backlinks)
  - `Canvas` (Infinite spatial note board)
  - `Command palette` (Quick command launcher)
  - `Daily notes` (Daily journal note creation)
  - `File recovery` (Local snapshot history)
  - `Graph view` (Interactive force-directed graph)
  - `Quick switcher` (Fuzzy file search)
  - `Templates` (Insertable note boilerplate)
- Each plugin row has:
  - Left: Plugin Icon + Name + Description
  - Right:
    - Settings Gear icon button (if plugin has settings, jumps directly to its settings tab)
    - Toggle Switch (enables/disables plugin)

---

## 6. Type Definitions & Architecture Contracts

```typescript
// features/settings/types.ts

export type SettingsGroup = "options" | "core-plugins" | "community-plugins";

export type SettingControlType =
  | "toggle"
  | "text"
  | "number"
  | "dropdown"
  | "slider"
  | "button"
  | "button-group"
  | "color";

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
  key?: string;
  name: string;
  description?: React.ReactNode;
  heading?: string;
  headingDescription?: string;
  type: SettingControlType;
  placeholder?: string;
  options?: SettingOption[];
  min?: number;
  max?: number;
  step?: number;
  button?: SettingButtonSpec;
  buttons?: SettingButtonSpec[];
  keywords?: string[];
  disabled?: boolean | (() => boolean);
  onChange?: (value: unknown) => void;
}

export interface SettingSectionDef {
  id: string;
  label: string;
  group: SettingsGroup;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  order?: number;
  pluginId?: string;
  isEnabled?: () => boolean;
  component?:
    React.LazyExoticComponent<React.ComponentType> | React.ComponentType;
  specs?: SettingItemSpec[];
}
```

---

## 7. Migration & Implementation Checklist

1. **Phase 1: Primitives & Layout**
   - [x] Add `SettingItem.tsx` and `SettingHeading.tsx` to `features/settings/components/`.
   - [x] Implement `SettingToggle`, `SettingDropdown`, `SettingSlider`, `SettingButton` control wrappers using `@workspace/ui`.
   - [x] Upgrade `SettingsFields.tsx` to render two-column `SettingItem` rows based on `SettingItemSpec`.

2. **Phase 2: Registry & Navigation**
   - [x] Implement `settingsRegistry` in `features/settings/registry.ts`.
   - [x] Update `SettingsNav.tsx` to render category groups (`OPTIONS`, `CORE PLUGINS`, `COMMUNITY PLUGINS`), icons, and active pill states.
   - [x] Add search icon, clear button, and deep search indexing.

3. **Phase 3: Core Sections & Plugins**
   - [x] Fill out `GeneralSection.tsx`, `AppearanceSection.tsx`, `EditorSection.tsx`, `FilesLinksSection.tsx`.
   - [x] Build `CorePluginsSection.tsx` plugin manager tab.
   - [x] Connect `TemplatesSection` and `DailyNotesSection` via declarative specs.

4. **Phase 4: Hotkeys Subsystem**
   - [x] Implement virtualized hotkey list and interactive key recorder in `HotkeysSection.tsx`.

5. **Phase 5: Verification**
   - [x] Run `bun run lint && cd apps/tauri && bunx tsc --noEmit && bun test`.
