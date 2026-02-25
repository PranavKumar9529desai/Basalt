# Codex Interaction Rules (Performance-Focused)

Purpose: keep the assistant fast and accurate by following these defaults.

## Tooling Discipline
- Always set project path and search via code-index (`code-index set_project_path`, `find_files`, `search_code`) before guessing.
- Use `sequentialthinking` for any non-trivial change (≥2 steps) to force explicit reasoning before edits.
- Prefer `rg`/`rg --files` for local search; avoid slow fallbacks unless `rg` is unavailable.
- Use web search only when information may be outdated or external; otherwise stay local.

## Performance Bias
- Profile before optimizing; cite m10-performance for choices.
- Keep edits minimal and localized; avoid unnecessary refactors without measurement.
- Avoid adding heavy dependencies without justification.

## Editing & Safety
- Never revert user changes; no destructive git commands.
- Default to ASCII; add comments only when code is non-obvious.
- Use `apply_patch` for single-file edits; don’t auto-format entire files unless asked.

## Theming/Editor (Basalt-specific)
- Use Satzion tokens and CSS variables; avoid hard-coded colors.
- Editor themes should be passed as extensions; respect `--sat-...` variables.

## UI Development (MANDATORY)
- **shadcn/Radix FIRST**: Always prefer shadcn/ui components over raw Tailwind markup. If a shadcn component exists for it (buttons, inputs, dialogs, scroll areas, separators, cards, tooltips, popovers, modals), USE IT. Only write raw Tailwind elements when no shadcn component covers the need.
- **`--sat-*` theme vars ALWAYS**: Every color MUST use `--sat-*` CSS custom properties. Never use Tailwind color classes (`bg-blue-600`), hard-coded hex values, or rgb/hsl. Use Tailwind only for layout/spacing (flex, padding, gap, grid). Example: `bg-[var(--sat-surface-1)]` not `bg-slate-900`.
- **Dumb UI components**: Components in `packages/ui/` must be stateless/presentational. Props in, DOM out. No Tauri imports, no `invoke()`, no data fetching. Internal UI state (hover, open/close) is allowed.
- **Folder structure**: Group related components in feature folders (`tabs/`, `sidebar/`, `pane/`). Atomic shadcn primitives go in `ui/` subfolder. Every feature folder must have an `index.ts` re-export.
- **Three-layer split**: Primitives in `packages/ui/`, business logic in `apps/tauri/src/features/`, layout composition in `apps/tauri/src/app-shell/`.
- **Navigation**: Desktop workspace app — use tabs/panels for content navigation, NOT routes. Routes only for top-level app modes (workspace vs onboarding).
- See `AGENTS.md` at project root for full rules.

## Response Style
- Be concise; lead with actions/findings.
- When asked for outputs, summarize key lines instead of dumping full logs.

Keep this file in sync when workflow changes.
