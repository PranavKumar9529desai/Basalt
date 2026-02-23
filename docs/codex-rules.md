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

## Response Style
- Be concise; lead with actions/findings.
- When asked for outputs, summarize key lines instead of dumping full logs.

Keep this file in sync when workflow changes.***
