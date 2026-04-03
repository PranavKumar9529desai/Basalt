# ADR-004: State-Driven Navigation Within the Workspace

**Status:** Accepted  
**Date:** 2026-04-04

## Context

Basalt is a desktop workspace app, not a web page. Early versions used URL routes for things like the graph view and settings panel, which caused back/forward navigation issues, broke tab restoration on restart, and made the URL bar meaningless in a Tauri window.

## Decision

Routes are used **only** for fundamentally different application modes:
- `/` → Main workspace (sidebar + tabs + editor)
- `/onboarding` → Vault picker / first-run experience

Everything inside the workspace is state-driven:
- Opening a file → opens a tab in the current pane
- Graph view, settings, backlinks → tabs or sidebar panels, not routes
- Split panes, active pane, panel collapse → workspace state in Zustand

Never create a route for something that should be a tab or panel.

## Consequences

+ Workspace layout and navigation are fully serializable — restart restores exact state
+ No URL bar nonsense in a native window
+ Tab groups and split panes work naturally as state trees
- New contributors from web backgrounds instinctively reach for routes; AGENTS.md must reinforce this
- Deep-linking to specific notes must go through workspace state APIs, not URLs
