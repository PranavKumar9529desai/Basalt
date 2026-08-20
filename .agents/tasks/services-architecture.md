# Task: CommandService + KeybindingService Architecture

## Goal

Restructure the command and keybinding systems into two independent TypeScript service packages:

- `packages/commands/` — CommandService: command registry + execution
- `packages/keybindings/` — KeybindingService: hotkey resolution + when clauses

Both are pure TS classes (no React dependency in core). Thin React wrappers handle window event listeners.

---

## Problem Statement

Current `@workspace/commands` package has three issues:

1. **Coupled metadata** — `commands.json` has a `hotkeys` field, meaning command definitions include keybinding info. These are separate concerns.
2. **No when clauses** — Contextual shortcuts (Escape to close modal, Tab to indent) can't be expressed. They live as scattered `useEffect` listeners.
3. **Single-purpose** — Keybindings can only map to commands. No way to register a keybinding that does something else (pure UI action).

---

## Architecture

### Layer Dependency

```
packages/commands/        ← standalone (no package deps)
packages/keybindings/     ← depends on packages/commands/
apps/tauri/src/           ← depends on both (via React wrappers)
```

### Package 1: `packages/commands/`

Pure TS command registry. No React, no keybinding logic.

```
packages/commands/
├── src/
│   ├── types.ts          ← Command, CommandMetadata interfaces
│   ├── commands.json     ← command metadata ONLY (id, name, category, icon)
│   ├── icons.ts          ← icon string → React component resolver
│   ├── service.ts        ← CommandService class (singleton)
│   ├── react.tsx         ← React hooks: useCommandService(), CommandProvider
│   └── index.ts          ← barrel exports
├── package.json
└── README.md
```

#### `types.ts`

```ts
import type React from "react";

export interface CommandMetadata {
  id: string;
  name: string;
  category?: string;
  icon?: string;  // string reference, resolved to React.ReactNode by icons.ts
}

export interface Command extends CommandMetadata {
  icon?: React.ReactNode;
  callback: () => void | Promise<void>;
  checkCallback?: () => boolean;
}
```

#### `service.ts` — CommandService class

```ts
import type { Command, CommandMetadata } from "./types";
import COMMANDS from "./commands.json";

export class CommandService {
  private commands = new Map<string, Command>();

  /** Register a command by id. Looks up metadata from commands.json. */
  registerCommand(
    id: string,
    callback: () => void | Promise<void>,
    checkCallback?: () => boolean,
  ): void;

  /** Register a full Command object (metadata + callback). */
  register(cmd: Command): void;

  /** Unregister a command by id. */
  unregister(id: string): void;

  /** Execute a command by id. Respects checkCallback. */
  execute(id: string): void;

  /** Get all registered commands (filtered by checkCallback). */
  getCommands(): Command[];

  /** Get static metadata from commands.json. */
  getMetadata(): CommandMetadata[];
}

// Singleton
export const commandService = new CommandService();
```

#### `commands.json` — metadata only, no hotkeys

```json
[
  { "id": "app:new-file", "name": "Create New Note", "category": "File", "icon": "IconFilePlus" },
  { "id": "app:delete-file", "name": "Delete Current Note", "category": "File", "icon": "IconTrash" },
  { "id": "app:extract-selection", "name": "Extract selection to new note", "category": "Editor", "icon": "IconPlus" },
  { "id": "tabs:close-active", "name": "Close Current Tab", "category": "Tabs", "icon": "IconX" },
  { "id": "tabs:close-others", "name": "Close Other Tabs", "category": "Tabs", "icon": "IconRectangleVertical" },
  { "id": "tabs:close-right", "name": "Close Tabs to the Right", "category": "Tabs", "icon": "IconRectangleVertical" },
  { "id": "tabs:toggle-pin", "name": "Pin/Unpin Current Tab", "category": "Tabs", "icon": "IconPinned" },
  { "id": "tabs:split-right", "name": "Split Right and Move Tab", "category": "Tabs", "icon": "IconLayoutBoardSplit" },
  { "id": "tabs:split-left", "name": "Split Left and Move Tab", "category": "Tabs", "icon": "IconLayoutBoardSplit" },
  { "id": "tabs:split-up", "name": "Split Up and Move Tab", "category": "Tabs", "icon": "IconLayoutBoardSplit" },
  { "id": "tabs:split-down", "name": "Split Down and Move Tab", "category": "Tabs", "icon": "IconLayoutBoardSplit" },
  { "id": "search:open", "name": "Search Vault", "category": "Search", "icon": "IconSearch" },
  { "id": "switcher:open", "name": "Quick Open File", "category": "Search", "icon": "IconFileSearch" },
  { "id": "app:open-settings", "name": "Open Settings", "category": "App", "icon": "IconSettings" }
]
```

Note: `hotkeys` field removed. Keybindings move to `packages/keybindings/`.

#### `react.tsx` — React integration

```tsx
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { CommandService } from "./service";

const CommandServiceContext = createContext<CommandService | null>(null);

export function CommandProvider({ children }: { children: ReactNode }) {
  const service = new CommandService();
  return (
    <CommandServiceContext.Provider value={service}>
      {children}
    </CommandServiceContext.Provider>
  );
}

export function useCommandService(): CommandService {
  const svc = useContext(CommandServiceContext);
  if (!svc) throw new Error("useCommandService must be used within CommandProvider");
  return svc;
}
```

#### `index.ts` — barrel exports

```ts
export { CommandService, commandService } from "./service";
export type { Command, CommandMetadata } from "./types";
export { CommandProvider, useCommandService } from "./react";
```

---

### Package 2: `packages/keybindings/`

Pure TS keybinding resolver. Depends on `packages/commands/` for command execution.

```
packages/keybindings/
├── src/
│   ├── types.ts              ← Keybinding, WhenContext types
│   ├── keybinding-service.ts ← KeybindingService class (singleton)
│   ├── hotkey-parser.ts      ← parseHotkey(), matchesHotkey() (extracted from current keyboard.ts)
│   ├── keybindings.json      ← static keybinding rules (key, command, when?)
│   ├── react.tsx             ← React wrappers: KeybindingProvider, useKeybindings(), KeybindingListener
│   └── index.ts              ← barrel exports
├── package.json
└── README.md
```

#### `types.ts`

```ts
export interface Keybinding {
  /** Key combination, e.g. "CmdOrCtrl+F", "Ctrl+S", "Escape" */
  key: string;
  /** Optional: command id to execute. If omitted, action is required. */
  command?: string;
  /** Optional: pure action to run. Used for non-command keybindings. */
  action?: () => void;
  /** Optional: when clause. If omitted, always active. */
  when?: string;
  /** Optional: override command's checkCallback. */
  priority?: boolean;
}

/** Context map for when clause evaluation. Keys are dot-separated paths. */
export type WhenContext = Record<string, boolean>;
```

#### `keybindings.json` — all keybinding rules

```json
[
  { "key": "CmdOrCtrl+N", "command": "app:new-file" },
  { "key": "CmdOrCtrl+W", "command": "tabs:close-active" },
  { "key": "CmdOrCtrl+F", "command": "search:open" },
  { "key": "CmdOrCtrl+O", "command": "switcher:open" },
  { "key": "CmdOrCtrl+,", "command": "app:open-settings" },
  { "key": "CmdOrCtrl+B", "command": "editor:bold", "when": "editorFocused" },
  { "key": "CmdOrCtrl+I", "command": "editor:italic", "when": "editorFocused" },
  { "key": "CmdOrCtrl+A", "command": "editor:select-all", "when": "editorFocused" },
  { "key": "CmdOrCtrl+X", "command": "editor:cut", "when": "editorFocused" },
  { "key": "CmdOrCtrl+C", "command": "editor:copy", "when": "editorFocused" },
  { "key": "CmdOrCtrl+V", "command": "editor:paste", "when": "editorFocused" },
  { "key": "CmdOrCtrl+P", "action": "openCommandPalette" },
  { "key": "CmdOrCtrl+S", "action": "saveActiveFile" },
  { "key": "Escape", "action": "closeTopModal", "when": "modalOpen" }
]
```

Note: `action` here is a string identifier. The `KeybindingService` maps action strings to callbacks registered by React components. This keeps keybindings.json declarative and pure data.

#### `keybinding-service.ts` — KeybindingService class

```ts
import type { Keybinding, WhenContext } from "./types";
import { commandService } from "@workspace/commands";
import KEYBINDINGS from "./keybindings.json";

export class KeybindingService {
  private bindings: Keybinding[] = [];
  private context: WhenContext = {};
  private actions = new Map<string, () => void>();

  constructor() {
    // Load static bindings from keybindings.json
    for (const raw of KEYBINDINGS) {
      this.bindings.push({ ...raw });
    }
  }

  /** Register a keybinding programmatically. */
  register(binding: Keybinding): void {
    this.bindings.push(binding);
  }

  /** Unregister a keybinding by key string. */
  unregister(key: string): void {
    this.bindings = this.bindings.filter((b) => b.key !== key);
  }

  /** Register an action handler (for non-command keybindings). */
  registerAction(name: string, handler: () => void): void {
    this.actions.set(name, handler);
  }

  /** Unregister an action handler. */
  unregisterAction(name: string): void {
    this.actions.delete(name);
  }

  /** Update a context value for when clause evaluation. */
  setContext(key: string, value: boolean): void {
    this.context[key] = value;
  }

  /** Update multiple context values at once. */
  updateContext(values: Record<string, boolean>): void {
    Object.assign(this.context, values);
  }

  /** Get the current context (read-only snapshot). */
  getContext(): Readonly<WhenContext> {
    return { ...this.context };
  }

  /** Evaluate a when clause against the current context. */
  evaluateWhen(when?: string): boolean {
    if (!when) return true;
    // Support negation: "!modalOpen"
    if (when.startsWith("!")) {
      return !this.context[when.slice(1)];
    }
    return this.context[when] === true;
  }

  /** Resolve a keyboard event to the best matching binding. */
  resolve(event: KeyboardEvent): Keybinding | null {
    // Sort by specificity: bindings with `when` clauses first, then no-when
    const sorted = [...this.bindings].sort((a, b) => {
      if (a.when && !b.when) return -1;
      if (!a.when && b.when) return 1;
      return 0;
    });

    for (const binding of sorted) {
      if (!this.matchesKey(event, binding.key)) continue;
      if (!this.evaluateWhen(binding.when)) continue;

      // If it's a command binding, check command's checkCallback
      if (binding.command) {
        const cmds = commandService.getCommands();
        const cmd = cmds.find((c) => c.id === binding.command);
        if (!cmd) continue;
        if (cmd.checkCallback && !cmd.checkCallback()) continue;
      }

      return binding;
    }
    return null;
  }

  /** Execute a resolved binding. */
  execute(binding: Keybinding): void {
    if (binding.command) {
      commandService.execute(binding.command);
    } else if (binding.action) {
      const handler = this.actions.get(binding.action);
      if (handler) handler();
    }
  }

  /** Handle a keyboard event (resolve + execute). Returns true if handled. */
  handleKeydown(event: KeyboardEvent): boolean {
    const binding = this.resolve(event);
    if (!binding) return false;
    event.preventDefault();
    this.execute(binding);
    return true;
  }

  private matchesKey(event: KeyboardEvent, hotkey: string): boolean {
    // Reuse hotkey-parser.ts logic
    const parsed = parseHotkey(hotkey);
    const keyMatch = event.key.toLowerCase() === parsed.key;
    const modMatch = parsed.cmdOrCtrl
      ? event.ctrlKey || event.metaKey
      : !event.ctrlKey && !event.metaKey;
    const shiftMatch = parsed.shift ? event.shiftKey : !event.shiftKey;
    const altMatch = parsed.alt ? event.altKey : !event.altKey;
    return keyMatch && modMatch && shiftMatch && altMatch;
  }
}

// Singleton
export const keybindingService = new KeybindingService();
```

#### `hotkey-parser.ts` — extracted from current `keyboard.ts`

```ts
export interface ParsedHotkey {
  key: string;
  cmdOrCtrl: boolean;
  shift: boolean;
  alt: boolean;
}

export function parseHotkey(hotkey: string): ParsedHotkey {
  // Same implementation as current keyboard.ts parseHotkey()
}

export function matchesHotkey(e: KeyboardEvent, parsed: ParsedHotkey): boolean {
  // Same implementation as current keyboard.ts matchesHotkey()
}
```

#### `react.tsx` — React integration

```tsx
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { KeybindingService } from "./keybinding-service";

const KeybindingContext = createContext<KeybindingService | null>(null);

/**
 * Provides the KeybindingService to the component tree.
 * Must be a child of CommandProvider.
 */
export function KeybindingProvider({ children }: { children: ReactNode }) {
  const service = new KeybindingService();
  return (
    <KeybindingContext.Provider value={service}>
      {children}
    </KeybindingContext.Provider>
  );
}

export function useKeybindingService(): KeybindingService {
  const svc = useContext(KeybindingContext);
  if (!svc) throw new Error("useKeybindingService must be used within KeybindingProvider");
  return svc;
}

/**
 * Mounts a single window keydown listener that routes through KeybindingService.
 * Mount this once at the app root.
 */
export function KeybindingListener() {
  const service = useKeybindingService();

  const handleKeydown = useCallback(
    (e: KeyboardEvent) => {
      service.handleKeydown(e);
    },
    [service],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleKeydown]);

  return null;
}
```

#### `index.ts` — barrel exports

```ts
export { KeybindingService, keybindingService } from "./keybinding-service";
export type { Keybinding, WhenContext } from "./types";
export { parseHotkey, matchesHotkey } from "./hotkey-parser";
export { KeybindingProvider, KeybindingListener, useKeybindingService } from "./react";
```

---

## Migration Plan

### Phase 1: Create the two packages (no breaking changes)

1. Refactor `packages/commands/` to `CommandService` class:
   - Create `service.ts` with `CommandService` class
   - Move `parseHotkey`/`matchesHotkey` to `packages/keybindings/src/hotkey-parser.ts`
   - Remove `HotkeyHandler` from commands package
   - Remove `hotkeys` field from `commands.json`
   - Keep `useCommandStore` as a thin Zustand bridge that delegates to `CommandService` (backward compat)

2. Create `packages/keybindings/`:
   - Create `keybinding-service.ts` with `KeybindingService` class
   - Create `hotkey-parser.ts` (extracted from commands/keyboard.ts)
   - Create `keybindings.json` (hotkey definitions extracted from commands.json + scattered useEffects)
   - Create `react.tsx` with `KeybindingProvider`, `KeybindingListener`

### Phase 2: Wire up in app-shell

3. Update `apps/tauri/`:
   - Replace `<HotkeyHandler />` in `__root.tsx` with `<KeybindingProvider><KeybindingListener /></KeybindingProvider>`
   - Wrap with `<CommandProvider>` as parent
   - Register action handlers for non-command keybindings:
     - `openCommandPalette` → `setOpen(true)` on `EditorCommandPalette`
     - `saveActiveFile` → `performSave()` (from editor)
     - `closeTopModal` → close active modal (settings, etc.)
   - Set context values:
     - `editorFocused` → from editor's `onFocus`/`onBlur` callbacks
     - `modalOpen` → from modals (settings, etc.) `onOpenChange`
   - Update all `useCommandStore.getState()` calls to use `commandService`

### Phase 3: Remove backward-compat bridge

4. Remove `useCommandStore` Zustand wrapper once all consumers use `commandService` directly
5. Remove `HotkeyHandler` component
6. Clean up `@workspace/commands` package.json (remove zustand dependency)

---

## When Clause Examples

| When clause | Context source | Meaning |
|---|---|---|
| `editorFocused` | Editor's onFocus/onBlur | Only active when editor has focus |
| `modalOpen` | Modal's onOpenChange | Only active when any modal is open |
| `!modalOpen` | Modal's onOpenChange | Only active when NO modal is open (Escape to close) |
| `settings.open` | Settings modal | Only active in settings context |
| (omitted) | — | Always active (Cmd+N, Cmd+W, etc.) |

---

## Context Registration Pattern

```tsx
// In EditorComponent.tsx
const setContext = useKeybindingService().setContext;

onFocus={() => setContext("editorFocused", true)}
onBlur={() => setContext("editorFocused", false)}

// In SettingsModal.tsx
onOpenChange={(open) => setContext("modalOpen", open)}
```

---

## Files to Create

| File | Package |
|---|---|
| `packages/keybindings/package.json` | keybindings |
| `packages/keybindings/src/types.ts` | keybindings |
| `packages/keybindings/src/hotkey-parser.ts` | keybindings |
| `packages/keybindings/src/keybinding-service.ts` | keybindings |
| `packages/keybindings/src/keybindings.json` | keybindings |
| `packages/keybindings/src/react.tsx` | keybindings |
| `packages/keybindings/src/index.ts` | keybindings |

## Files to Modify

| File | Change |
|---|---|
| `packages/commands/src/types.ts` | Remove `hotkeys` from `CommandMetadata` |
| `packages/commands/src/service.ts` | NEW: CommandService class |
| `packages/commands/src/react.tsx` | NEW: CommandProvider, useCommandService |
| `packages/commands/src/store.ts` | Thin bridge to CommandService (remove after migration) |
| `packages/commands/src/keyboard.ts` | DELETE (replaced by keybindings package) |
| `packages/commands/src/commands.json` | Remove `hotkeys` field |
| `packages/commands/src/index.ts` | Update exports |
| `packages/commands/package.json` | Remove zustand dependency |
| `apps/tauri/src/routes/__root.tsx` | Replace HotkeyHandler with KeybindingProvider+Listener |
| `apps/tauri/src/features/editor/hooks/useEditor.ts` | Register Ctrl+S via keybindingService |
| `apps/tauri/src/features/settings/components/SettingsModal.tsx` | Set `modalOpen` context, register Escape |
| `apps/tauri/src/features/editor/components/CommandPalette.tsx` | Register Ctrl+P as action |
| `apps/tauri/src/features/editor/hooks/useEditorCommands.tsx` | Use commandService directly |
| `apps/tauri/src/features/editor/components/EditorContextMenu.tsx` | Use commandService directly |
| `apps/tauri/src/features/tabs/commands.ts` | Use commandService directly |
| `apps/tauri/src/features/search/commands.ts` | Use commandService directly |
| `apps/tauri/src/features/editor/commands.ts` | Use commandService directly |
| `apps/tauri/src/features/settings/commands.ts` | Use commandService directly |
| `apps/tauri/src/app-shell/WorkspaceView.tsx` | Use commandService directly |

---

## Verification

After each phase:
```bash
bun run lint && bunx tsc --noEmit
```

Test manually:
- Cmd+N, Cmd+W, Cmd+F, Cmd+O all still work
- Cmd+B, Cmd+I only work when editor is focused
- Escape closes settings modal
- Cmd+P opens command palette
- Cmd+S saves immediately
- Right-click context menu shows commands with correct icons
- Command palette shows all registered commands
