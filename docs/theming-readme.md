# Theming & Design Tokens (Satzion)

How to structure themes so every component can pick up new looks by swapping CSS variables.

## Token Layers
- **Base palette:** raw color values (HSL/RGB).
- **Semantic tokens:** surface, border, text, accent, success, warning, danger, info, muted; derived from base.
- **Component tokens:** per-slot values (button.bg, sidebar.bg, tab.active, editor.gutter, shadow.lg, radius.md, spacing.xs) derived from semantic.
- **Modes:** light/dark/high-contrast overrides applied on `[data-theme]`.

## Files & Folders (proposed)
- `packages/ui/tokens/base.json` — base palette.
- `packages/ui/tokens/semantic.json` — maps base → semantic.
- `packages/ui/tokens/component.json` — maps semantic → component slots.
- `packages/ui/theme/*.json` — actual themes (light/dark/solarized/etc.) overriding semantic/component tokens.
- `packages/ui/tokens/build.ts` — generates `globals.css` (CSS vars with prefix `--sat-`) + `tokens.d.ts` for typed access.
- `apps/tauri/src/app-shell/ThemeProvider.tsx` — applies `[data-theme]`, injects CSS vars.
- `apps/tauri/src/app-shell/useTheme.ts` — switch/preview themes.

## Naming & Usage Rules
- Namespace all vars: `--sat-surface-1`, `--sat-text-primary`, `--sat-button-bg`, etc.
- Components consume **component tokens only** (never raw colors or spacing literals).
- JS uses generated token map for non-CSS needs (e.g., chart palettes).
- Avoid magic numbers; prefer tokenized spacing, radius, shadow, motion, typography.

## Build & Runtime Flow
1) Build step reads token JSON → writes `globals.css` and typed token map.
2) At runtime, `ThemeProvider` sets `[data-theme]` and injects vars (or imports the built CSS).
3) Switching themes swaps the loaded JSON and re-applies vars; components need no code changes.
4) Plugins can override a limited subset by injecting extra vars with the same prefix.

## Accessibility & Modes
- Provide light/dark plus a high-contrast theme.
- Ensure WCAG AA for text on primary surfaces; test both modes.
- Keep focus, outline, and error colors in semantic tokens so themes cannot accidentally remove affordances.

## Quick Start Checklist
- [ ] Define token taxonomy and names.
- [ ] Implement `build.ts` to emit CSS + types.
- [ ] Convert a few core components in `packages/ui` to component tokens.
- [ ] Add theme switcher UI; ship light/dark defaults.
- [ ] Document allowed plugin overrides.

Following this keeps themes plug-and-play: change token files, rebuild, and the whole UI updates without touching component code.
