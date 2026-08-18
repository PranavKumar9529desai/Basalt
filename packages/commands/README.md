# @workspace/commands — Command Registry + Hotkey System

Infrastructure for the global command palette and keyboard shortcuts.

## Architecture

```
packages/commands/
├── commands.json   ← static metadata (id, name, category, hotkeys, icon)
├── types.ts        ← CommandMetadata + Command
├── store.ts        ← Zustand registry: registerCommand(id, callback)
├── keyboard.ts     ← HotkeyHandler component
├── icons.ts        ← icon name → React component resolver
└── index.ts        ← barrel exports
```

**How it works:**

1. `commands.json` is the **single source of truth** for what commands exist
2. Features **register callbacks** by passing `id` + `callback` to the store
3. The store **merges** metadata from JSON with the callback
4. `HotkeyHandler` reads from the store and dispatches on keydown
5. `CommandPalette` reads from the store and shows all commands

## Registering Commands

Features register their own commands at import time. No central boot file needed.

```ts
// features/search/commands.ts
import { useCommandStore } from "@workspace/commands";
import { useSearchStore } from "./store";

const { registerCommand } = useCommandStore.getState();
registerCommand("search:open", useSearchStore.getState().openSearch);
```

That's it. The store looks up `search:open` in `commands.json`, finds the metadata (name, category, hotkeys, icon), merges with the callback, and stores the result.

**For commands that need runtime state** (e.g., conditional commands):

```ts
// features/tabs/commands.ts
registerCommand("tabs:close-active", () => {
  // reads current state at execution time
  const tab = useTabsStore.getState().resolveTab();
  if (tab) useTabsStore.getState().closeTab(tab);
}, () => /* checkCallback: is there an active tab? */);
```

**For commands that need hook data** (cross-feature, registered in shell):

```ts
// In WorkspaceView.tsx
useEffect(() => {
  const { registerCommand, unregister } = useCommandStore.getState();
  registerCommand("app:new-file", controller.createNoteInstant);
  return () => unregister("app:new-file");
}, [controller.createNoteInstant]);
```

## Adding a New Command

1. Add metadata to `packages/commands/src/commands.json`
2. Register callback in the owning feature's `commands.ts`
3. Done — hotkeys and command palette work automatically

## Hotkeys

`HotkeyHandler` is mounted once at the app root (`__root.tsx`). It listens for keydown events and matches against registered commands' hotkeys.

**Hotkey format:** `CmdOrCtrl+F`, `CmdOrCtrl+Shift+P`, `Alt+X`

- `CmdOrCtrl` → Meta on macOS, Ctrl on Windows/Linux
- `Shift`, `Alt` → standard modifiers
- Key matches `KeyboardEvent.key` (lowercased)

## Types

- `CommandMetadata` — static data from `commands.json` (id, name, category, hotkeys, icon)
- `Command` — metadata + runtime callback + optional checkCallback
