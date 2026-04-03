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

## Consequences

+ Instant theme switching without React re-renders — CSS variable changes don't trigger VDOM diffing
+ User themes are simple CSS files that override `--sat-*` variables under a `[data-theme="..."]` selector
+ Community theme ecosystem becomes possible (like Obsidian's)
- Slightly more verbose class strings than raw Tailwind color utilities
- Every new color decision requires adding or reusing a token (no quick one-offs)
