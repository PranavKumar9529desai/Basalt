# @workspace/commands — CommandService

Global command registry for the Basalt workspace.

## Architecture

```
packages/commands/
├── commands.json   ← static metadata (id, name, category, icon)
├── types.ts        ← CommandMetadata + Command interfaces
├── service.ts      ← CommandService class (singleton)
├── react.tsx       ← CommandProvider + useCommandService hook
├── icons.ts        ← icon name → React component resolver
└── index.ts        ← barrel exports
```

**How it works:**

1. `commands.json` is the **single source of truth** for what commands exist
2. Features **register callbacks** via `commandService.registerCommand(id, callback)`
3. The service **merges** metadata from JSON with the callback
4. `CommandPalette` reads from the service and shows all commands

## Registering Commands

```ts
import { commandService } from "@workspace/commands";

// Simple registration
commandService.registerCommand("search:open", useSearchStore.getState().openSearch);

// With checkCallback (conditional availability)
commandService.registerCommand("tabs:close-active", () => {
  const tab = useTabsStore.getState().resolveTab();
  if (tab) useTabsStore.getState().closeTab(tab);
}, () => /* is there an active tab? */);
```

**For commands that need hook data** (registered in shell):

```tsx
// In WorkspaceView.tsx
useEffect(() => {
  commandService.registerCommand("app:new-file", controller.createNoteInstant);
  return () => commandService.unregister("app:new-file");
}, [controller.createNoteInstant]);
```

## Keybindings

Keybindings are handled by `@workspace/keybindings`, not this package. See `packages/keybindings/`.

## Adding a New Command

1. Add metadata to `packages/commands/src/commands.json`
2. Register callback in the owning feature or shell
3. Add keybinding in `packages/keybindings/src/keybindings.json`

## Types

- `CommandMetadata` — static data from `commands.json` (id, name, category, icon)
- `Command` — metadata + runtime callback + optional checkCallback
