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
├── hotkey-parser.ts       # parseHotkey (hotkey string → matcher)
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
| `setContext(key, value)`   | Set/update a `when` context value (`boolean \| string \| number`) |
| `removeContext(key)`       | Delete a context key                              |
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

Resolution: among key-matching bindings, one whose `when` clause evaluates
true wins over an unconditional same-key binding; unconditional bindings act
as the fallback when no `when` clause matches. If nothing matches, `resolve`
returns `null` and `handleKeydown` does **not** `preventDefault`.

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

`when` clauses are compiled **once** (at service rebuild) into plain
evaluator closures; evaluation per keypress is a simple map lookup.

- Absent / empty → unconditional (always active).
- `"key"` → active when `context[key] === true`.
- `"!key"` → active when `context[key] !== true`.
- `"a && b"`, `"a || b"`, `"!"`, and parentheses compose freely.
- `"key == 'value'"` / `"key != 'value'"` compare a typed context value
  against a quoted string, number, or boolean literal
  (`viewMode == 'reading'`, `tabCount == 3`, `editorFocused == 'true'`).

A clause with a syntax error is treated as **never matching** (a broken
binding can never fire unexpectedly); a warning is logged at compile time.

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
