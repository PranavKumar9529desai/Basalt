# ADR-003: shadcn/Radix Over Raw Tailwind Markup

**Status:** Accepted  
**Date:** 2026-04-04

## Context

Hand-rolling interactive components (dropdowns, dialogs, tooltips, modals) with raw `<div>` + Tailwind produces components that are visually similar but miss critical behaviors: keyboard navigation, focus trapping, ARIA attributes, portal rendering, and scroll lock. These gaps cause accessibility failures and subtle UX bugs.

## Decision

Whenever a shadcn/ui component exists for what you need, use it. Do not hand-write a raw HTML element with Tailwind classes when a shadcn primitive already covers it.

This applies to: buttons, inputs, dialogs, dropdowns, scroll areas, separators, cards, tooltips, popovers, modals, context menus, command palettes, and all other interactive elements.

Only write raw Tailwind when no shadcn/Radix component covers the need (e.g., a custom graph canvas, a virtualized list container, a unique layout wrapper).

**Wrong:**
```tsx
<button className="px-4 py-2 bg-[var(--sat-accent-primary)] rounded">Save</button>
<div className="overflow-y-auto h-full">{children}</div>
```

**Right:**
```tsx
import { Button } from "@workspace/ui/components/ui/button";
<Button variant="default">Save</Button>

import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
<ScrollArea className="h-full">{children}</ScrollArea>
```

## Consequences

+ Keyboard navigation and ARIA come for free
+ Consistent behavior across the entire app
+ Smaller surface area to maintain — shadcn handles the hard parts
- Requires knowing what shadcn has before writing custom components
- shadcn component APIs can be more verbose than a raw div for simple cases
