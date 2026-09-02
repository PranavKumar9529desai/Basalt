# @workspace/keybindings — KeybindingService

Keyboard shortcut registry and dispatcher for Basalt. Owns all hotkey rules
(from `keybindings.json`), evaluates `when` clauses against a mutable context
map, and on keydown either runs a registered **action** or delegates to
`@workspace/commands`' `commandService.execute()`.

Depends on [`@workspace/commands`](../commands).

## Responsibility

- Single source of truth for every global hotkey in `keybindings.json`
- Match `KeyboardEvent` against bindings, honoring modifiers + `when` context
- Dispatch to either a Command (`command` field) or a plain action handler
  (`action` field)

This is a **plain TypeScript service** — no React. React integration is the
`KeybindingProvider` / `KeybindingListener` pair below. Features set context
values (`editorFocused`, `modalOpen`) via `setContext()`; the service never
imports from features.

## Architecture

```
packages/keybindings/
├── keybindings.json       # static hotkey rules (source of truth)
├── types.ts               # Keybinding + WhenContext
├── hotkey-parser.ts       # parseHotkey / matchesHotkey
├── keybinding-service.ts  # KeybindingService class (singleton)
├── react.tsx              # KeybindingProvider + KeybindingListener + useKeybindingService
└── index.ts               # public API barrel
```

## Public API

```ts
import {
  keybindingService, // singleton
  KeybindingService,
  parseHotkey,
  matchesHotkey,
  KeybindingProvider,
  KeybindingListener,
  useKeybindingService,
} from "@workspace/keybindings";
```

### Service

| Method                     | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `register(binding)`        | Add a binding at runtime                         |
| `unregister(key)`          | Remove a binding by its `key` string             |
| `registerAction(name, fn)` | Register a plain action handler (non-command)    |
| `unregisterAction(name)`   | Remove an action handler                         |
| `setContext(key, value)`   | Set a `when` context flag (e.g. `editorFocused`) |
| `updateContext(values)`    | Bulk-set context flags                           |
| `getContext()`             | Snapshot of the current context                  |
| `evaluateWhen(when?)`      | Evaluate a when clause against context           |
| `resolve(event)`           | Find matching binding, or `null`                 |
| `execute(binding)`         | Run the binding's command/action                 |
| `handleKeydown(event)`     | Resolve + execute; returns `true` if handled     |

`handleKeydown` returns `false` (and does **not** `preventDefault`) when no
binding matches, letting other handlers see the event.

### Binding schema (`keybindings.json`)

Each entry is a `Keybinding`:

```jsonc
{ "key": "CmdOrCtrl+F", "command": "search:open" },
{ "key": "CmdOrCtrl+P", "action": "openCommandPalette" },
{ "key": "CmdOrCtrl+B", "command": "editor:bold", "when": "editorFocused" }
```

- `key` — combination, e.g. `"CmdOrCtrl+F"`, `"Escape"`
- `command` — command id to execute **OR** `action` — non-command handler name
  (exactly one of the two)
- `when` — optional context gate; absent = always active

Resolution priority: bindings with a `when` clause sort **before** unqualified
ones, so context-gated editor bindings win over same-key global ones.

### Modifier semantics

| Specified           | Matches          | Notes                              |
| ------------------- | ---------------- | ---------------------------------- |
| `CmdOrCtrl` / `mod` | ctrl **or** meta | The canonical, cross-platform form |
| `Cmd` / `Meta`      | ctrl-or-meta     | Mapped to the same behavior        |
| `Ctrl`              | ctrl-or-meta     | Mapped to the same behavior        |
| `Shift`             | `event.shiftKey` |                                    |
| `Alt`               | `event.altKey`   |                                    |

The key portion matches `KeyboardEvent.key` (lowercased).

### When-clause semantics

- Absent → always matches.
- `"key"` → active when `context[key] === true` (e.g. `editorFocused`).
- `"!key"` → active when `context[key] !== true` (negation).

## React integration

```tsx
import {
  KeybindingProvider,
  KeybindingListener,
  useKeybindingService,
} from "@workspace/keybindings";

// At the app root — mount the single global keydown listener once:
<KeybindingProvider>
  <KeybindingListener />
  <App />
</KeybindingProvider>;

// Inside a feature that wants to gate a binding:
function Editor() {
  const service = useKeybindingService();
  // service.setContext("editorFocused", isFocused);
}
```

`KeybindingProvider` makes the singleton injectable via Context (DI without a
container). `KeybindingListener` mounts a single `window` `keydown` listener
that routes through `service.handleKeydown`; mount it **once** at the app root.

## Adding a new hotkey

1. Add a `command` binding to `packages/keybindings/src/keybindings.json`
   (ensure the command id exists in `@workspace/commands`), or
2. for a non-command shortcut, add an `action` binding and register a handler
   via `keybindingService.registerAction(name, fn)`.
3. If the binding should only fire in a context, add a `when` clause and set
   that context flag from the owning feature.
