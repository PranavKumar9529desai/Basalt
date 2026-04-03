# Codex Interaction Rules

For UI/theming/architecture rules see `AGENTS.md`.

## Tooling Discipline

- Always set project path and search via code-index (`code-index set_project_path`, `find_files`, `search_code`) before guessing.
- Use `sequentialthinking` for any non-trivial change (≥2 steps) to force explicit reasoning before edits.
- Prefer `rg`/`rg --files` for local search; avoid slow fallbacks unless `rg` is unavailable.
- Use web search only when information may be outdated or external; otherwise stay local.
- Profile before optimizing; cite m10-performance for choices.
- Keep edits minimal and localized; avoid unnecessary refactors without measurement.
- Never revert user changes; no destructive git commands.
- Use `apply_patch` for single-file edits; don't auto-format entire files unless asked.
