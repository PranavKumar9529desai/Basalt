/**
 * KeybindingService — Keyboard shortcut registry and dispatcher (TS service).
 *
 * Architecture: Owns all keybinding rules (from keybindings.json) and
 * evaluates "when" clauses against a mutable context map. On keydown,
 * finds the matching binding, checks its when condition, and either
 * executes a registered action or delegates to CommandService.execute().
 *
 * This is a plain TS class — no React. React integration is via
 * KeybindingProvider (DI wrapper) and KeybindingListener (mounts the
 * global keydown handler). Features set context values (editorFocused,
 * modalOpen) via setContext(); the service never imports from features.
 */
import { commandService } from "@workspace/commands";
import { parseHotkey } from "./hotkey-parser";
import KEYBINDINGS from "./keybindings.json";
import type { Keybinding, WhenContext } from "./types";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !target.readOnly && !target.disabled;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly && !target.disabled;
  if (target instanceof HTMLSelectElement) return !target.disabled;
  return target.isContentEditable;
}

export class KeybindingService {
  private bindings: Keybinding[];
  private context: WhenContext = {};
  private actions = new Map<string, () => void>();

  constructor() {
    this.bindings = KEYBINDINGS.map((b) => ({ ...b }));
  }

  register(binding: Keybinding): void {
    this.bindings.push(binding);
  }

  unregister(key: string): void {
    this.bindings = this.bindings.filter((b) => b.key !== key);
  }

  registerAction(name: string, handler: () => void): void {
    this.actions.set(name, handler);
  }

  unregisterAction(name: string): void {
    this.actions.delete(name);
  }

  setContext(key: string, value: boolean): void {
    this.context[key] = value;
  }

  updateContext(values: Record<string, boolean>): void {
    Object.assign(this.context, values);
  }

  getContext(): Readonly<WhenContext> {
    return { ...this.context };
  }

  evaluateWhen(when?: string): boolean {
    if (!when) return true;
    if (when.startsWith("!")) {
      return this.context[when.slice(1)] !== true;
    }
    return this.context[when] === true;
  }

  resolve(event: KeyboardEvent): Keybinding | null {
    const sorted = [...this.bindings].sort((a, b) => {
      if (a.when && !b.when) return -1;
      if (!a.when && b.when) return 1;
      return 0;
    });

    for (const binding of sorted) {
      const parsed = parseHotkey(binding.key);
      const keyMatch = event.key.toLowerCase() === parsed.key;
      const modMatch = parsed.cmdOrCtrl
        ? event.ctrlKey || event.metaKey
        : !event.ctrlKey && !event.metaKey;
      const shiftMatch = parsed.shift ? event.shiftKey : !event.shiftKey;
      const altMatch = parsed.alt ? event.altKey : !event.altKey;

      if (!keyMatch || !modMatch || !shiftMatch || !altMatch) continue;
      if (!this.evaluateWhen(binding.when)) continue;

      if (binding.command) {
        const allCmds = commandService.getCommands();
        const cmd = allCmds.find((c) => c.id === binding.command);
        if (!cmd) continue;
      }

      if (binding.action && !this.actions.has(binding.action)) continue;

      return binding;
    }
    return null;
  }

  execute(binding: Keybinding): void {
    if (binding.command) {
      commandService.execute(binding.command);
    } else if (binding.action) {
      const handler = this.actions.get(binding.action);
      if (handler) handler();
    }
  }

  handleKeydown(event: KeyboardEvent): boolean {
    if (isEditableTarget(event.target)) return false;
    const binding = this.resolve(event);
    if (!binding) return false;
    event.preventDefault();
    this.execute(binding);
    return true;
  }
}

export const keybindingService = new KeybindingService();
