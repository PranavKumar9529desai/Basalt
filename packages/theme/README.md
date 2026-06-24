# @workspace/theme — SAT CSS Token System

Design token system for Basalt. Generates CSS custom properties (`--sat-*`)
from JSON token definitions.

## Responsibility

- Define design tokens in JSON schema (`tokens/`)
- Generate CSS output (`src/generated/tokens.css`)
- Provide theme JSON files (`themes/`) that override token values
- Export TypeScript types for token names

## Usage

```tsx
// Import the generated CSS in your app root:
import "@workspace/theme/tokens.css";

// Use tokens in components:
<div className="bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)]" />

// Switch themes by setting data-theme attribute:
document.documentElement.setAttribute("data-theme", "catppuccin-mocha");
```

## Token Families

| Prefix | Purpose |
|---|---|
| `--sat-surface-*` | Background surfaces (1, 2, 3) |
| `--sat-text-*` | Text colors (primary, muted, inverse) |
| `--sat-accent-*` | Accent / interactive colors |
| `--sat-layout-*` | Layout chrome (borders, shadows, radii) |
| `--sat-editor-*` | Editor-specific (headings, code blocks, etc.) |
| `--sat-state-*` | Semantic states (success, warning, danger, info) |
| `--sat-palette-*` | Raw palette values (used internally) |
| `--sat-radius-*` | Border radius scale |
| `--sat-spacing-*` | Spacing scale |
| `--sat-shadow-*` | Box-shadow scale |
| `--sat-font-*` | Font family tokens |

## Structure

```
tokens/           # JSON token definitions (source of truth)
├── base.json     # Primitive palette values
├── semantic.json # Semantic token mappings
├── component.json # Component-specific tokens
└── schema.json   # Validation schema
themes/           # Theme override files
├── manifest.ts   # Theme registry (name → file mapping)
├── dark.json
├── light.json
├── dracula.json
├── solarized-dark.json / solarized-light.json
├── catppuccin-latte.json / catppuccin-mocha.json
src/
├── generated/
│   └── tokens.css  # Auto-generated CSS output
├── types.ts        # TypeScript token name enum
└── index.ts        # Public API
build.ts            # Token build script
```

## Building

```bash
cd packages/theme && bun run build:tokens
```
