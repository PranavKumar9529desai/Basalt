# @workspace/commands — Global Command Palette System

Cross-cutting command registry for the Basalt workspace app.

## Responsibility

Provides a global Zustand store (`useCommandStore`) where any feature can
register/unregister commands. The `CommandPalette` UI primitive in `@workspace/ui`
reads from this store to render the palette.

## Why a separate package?

The command store was originally inside `@workspace/editor`, but it's used by
multiple features (workspace, editor, search, etc.) — making them all depend
on the editor package for a non-editor concern. Extracting it here removes
that coupling.

## Public API

```ts
import { useCommandStore } from "@workspace/commands";
import type { Command } from "@workspace/commands";

// Hook into the store
const { register, unregister, execute, commands, getCommands } = useCommandStore();

// Register a command
register({
  id: "app:my-action",
  name: "My Action",
  category: "My Feature",
  icon: <IconX size={16} />,
  callback: () => doSomething(),
});

// Unregister on unmount
useEffect(() => {
  return () => unregister("app:my-action");
}, []);
```

## Conventions

- Command IDs use namespaced kebab-case: `feature:action-name`
- Always call `unregister` in a `useEffect` cleanup return
- Keep `checkCallback` for conditional visibility
