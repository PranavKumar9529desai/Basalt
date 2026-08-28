# Graph View (NoteGraph) — Feature Folder

> Working folder for the Graph View feature: research, proposals, and
> decisions made **before** implementation starts. Nothing here is an ADR —
> when we finalize the architecture, it graduates to `docs/adr/NNN-*`.

## Files

| File | Contents |
| --- | --- |
| [`research.md`](./research.md) | Obsidian graph inventory, forum pain points (with demand signals), competitor/plugin analysis |
| [`proposal.md`](./proposal.md) | Proposed phased scope, performance gates, and the open architecture questions to settle before coding |

## Status

- [x] Research pass (2026-08-25)
- [x] Initial proposal drafted
- [ ] Architecture decision (physics location: Rust IPC vs WASM worker vs hybrid)
- [ ] ADR written + phased scope locked
- [ ] Implementation

## One-line direction

Obsidian ships a passive visualization; every serious plugin/competitor treats
the graph as an *instrument* — something you arrange, query, save, and reason
with. Basalt's Rust backend lets us make that instrument instant at vault
scales where Obsidian's graph freezes.
