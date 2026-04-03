# ADR-001: Three-Layer UI Architecture

**Status:** Accepted  
**Date:** 2026-04-04

## Context

Basalt is a desktop app built with Tauri + React. Early prototyping mixed Tauri IPC calls, business logic, and visual markup into the same components — making it impossible to test, reuse, or reason about code in isolation.

## Decision

Every UI feature is split across exactly three layers, each with a single responsibility:

| Layer | Location | Responsibility | Tauri knowledge |
|---|---|---|---|
| Primitives | `packages/ui/` | Visual components. Props in, DOM out. | Never |
| Features | `apps/tauri/src/features/` | State, hooks, business logic, IPC | Yes |
| Shell | `apps/tauri/src/app-shell/` | Layout composition. Thin glue only. | Yes |

**Litmus test:** "Can this component render in an empty `index.html` with zero backend?"
- Yes → `packages/ui/`
- No → `apps/tauri/src/features/`

## Consequences

+ UI primitives are reusable, testable, and renderable in isolation (Storybook, tests, web)
+ Features are self-contained — each exposes its API through hooks
+ Shell stays thin; it never owns logic, only wires layers together
- Features must not import from other features directly; all cross-feature wiring goes through shell
- Requires discipline to avoid layer-crossing shortcuts during rapid prototyping
