# ADR-005: Zustand for Feature State Management

**Status:** Accepted  
**Date:** 2026-04-04

## Context

Basalt needs global-ish state for tabs, panes, sidebar, and workspace layout. Options considered: Redux Toolkit, Jotai, Zustand, plain React Context + useReducer.

Redux was too heavy for the scope. Context + useReducer has poor performance for high-frequency updates (tab switching, drag-and-drop). Jotai and Zustand were both viable.

## Decision

Use **Zustand** for feature-level state across the app.

Rationale:
- Already in use in `packages/editor/src/commands/store.ts` — consistency
- Fine-grained selector subscriptions prevent unnecessary re-renders in large tab sets
- Low boilerplate: actions and state live in one store definition
- Works well with the feature folder model — each feature owns its Zustand slice

Each feature's store lives in `apps/tauri/src/features/<name>/store/` or `store.ts`. The store exposes typed slices and selectors. Components subscribe only to the slices they need.

## Consequences

+ Minimal boilerplate vs Redux
+ Selector-based subscriptions contain re-render blast radius during tab switching/drag
+ Single import pattern: `useWorkspaceStore(state => state.tabs)` everywhere
- Zustand doesn't enforce action patterns — discipline required to keep stores readable
- Large stores can drift into a "god object"; features must keep their slice boundaries clean
