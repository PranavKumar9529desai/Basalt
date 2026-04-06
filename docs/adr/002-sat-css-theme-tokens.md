# ADR-002: `--sat-*` CSS Custom Properties for All Colors

**Status:** Accepted  
**Date:** 2026-04-04

## Context

Basalt targets Obsidian-level user theming — users should be able to install community themes (simple CSS files) that completely restyle the app. If components hard-code hex values or Tailwind color classes, themes break or require overriding hundreds of selectors.

We also had a regression where a component used `bg-slate-900` directly and became invisible when a light theme was active.

## Decision

Every color in the app must come from a `--sat-*` CSS custom property. No exceptions.

**Forbidden:**
```tsx
<div className="bg-blue-600 text-white border-gray-700">
<div className="bg-[#1e293b]">
<div style={{ backgroundColor: '#0f172a' }}>
```

**Required:**
```tsx
<div className="bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] border-[var(--sat-layout-border)]">
```

Token families:
- `--sat-surface-*` — background layers (1, 2, 3)
- `--sat-text-*` — text (primary, secondary, muted, inverse)
- `--sat-accent-*` — brand/action (primary, hover)
- `--sat-layout-*` — structural (border, divider)
- `--sat-state-*` — semantic states (danger, warning, success)
- `--sat-editor-*` — editor-specific (background, cursor, selection)

Tailwind utility classes are still allowed for layout and spacing (`flex`, `gap-2`, `p-4`, `w-full`).

Theme definitions live in `packages/ui/src/styles/` and `packages/ui/theme/`.

## Token Layer Architecture

Tokens are defined in three layers in `packages/theme/tokens/`, processed by `packages/theme/build.ts`:

| Layer | File | Purpose |
|-------|------|---------|
| **Base** | `base.json` | Raw values — hex colors, px sizes, font stacks. These are also the **default dark theme** values that populate `:root {}`. |
| **Semantic** | `semantic.json` | Named roles — `surface.1 = {palette.surface1}`. Describes *what a token is for*, not what color it is. |
| **Component** | `component.json` | Context-specific tokens — `editor.heading1`, `layout.border`. References semantic or base tokens. |

The build pipeline resolves `{key.path}` references across layers and emits:
- `packages/theme/src/generated/tokens.css` — source of truth
- `packages/ui/src/styles/globals.css` — synced copy for app import
- `packages/theme/src/types.ts` — `TokenName` union type

**Known limitation:** The `--sat-palette-*` variables (base layer) are emitted into CSS but nothing in the codebase reads them directly. Components consume the semantic layer (`--sat-surface-*`, `--sat-accent-*`, etc.). The palette layer exists as scaffolding for future use cases where multiple semantic roles might share a palette entry, or where themes reuse colors under different names.

## Built-in Theme System

Seven themes ship with the app (dark, light, dracula, catppuccin-mocha, catppuccin-latte, solarized-dark, solarized-light). Each is a JSON file in `packages/theme/themes/` containing only the overrides relative to the dark baseline. The build pipeline emits them as:

```css
[data-theme="light"] {
  --sat-surface-1: #f8fafc;
  --sat-editor-background: #ffffff;
  /* only what differs from :root defaults */
}
```

`ThemeProvider` (`apps/tauri/src/layout/ThemeProvider.tsx`) sets `document.documentElement.setAttribute("data-theme", id)` — the entire CSS cascade updates instantly with no React re-renders.

**Current constraint:** All themes are resolved at **build time**. There is no runtime path for loading user-supplied theme files. This is the gap that must be closed to support community themes.

## User Theme Roadmap

The CSS-variable architecture is already compatible with user-defined themes. A user theme is just:

```css
[data-theme="my-theme"] {
  --sat-surface-1: #1a1a2e;
  --sat-accent-primary: #e94560;
}
```

Injected as a `<style>` tag at runtime, with `data-theme="my-theme"` set on `<html>`. No rebuild required.

The semantic layer becomes load-bearing here: users only need to override the ~10 semantic tokens (`--sat-surface-*`, `--sat-accent-*`, `--sat-text-*`, `--sat-layout-border`) and the component cascade handles the rest automatically. They do not need to know about the 80+ component-level tokens.

Work required to enable user themes:
1. A Tauri command to enumerate and read theme files from a user data directory (e.g. `~/.config/basalt/themes/`)
2. Runtime `<style>` tag injection in `ThemeProvider`
3. `ThemeProvider` extended to discover and register user themes alongside built-ins
4. A settings UI for theme selection and management

## Consequences

+ Instant theme switching without React re-renders — CSS variable changes don't trigger VDOM diffing
+ User themes are simple CSS files that override `--sat-*` variables under a `[data-theme="..."]` selector
+ Community theme ecosystem becomes possible (like Obsidian's)
+ The three-layer token system means theme authors only need to override semantic tokens — the component cascade handles the rest
- Slightly more verbose class strings than raw Tailwind color utilities
- Every new color decision requires adding or reusing a token (no quick one-offs)
- Built-in themes require a rebuild; user themes will need the runtime injection path described above
