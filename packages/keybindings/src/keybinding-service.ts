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
import { parseHotkey, type ParsedHotkey } from "./hotkey-parser";
import KEYBINDINGS from "./keybindings.json";
import { parseWhen, type WhenEvaluator } from "./when-parser";
import type { ContextValue, Keybinding, WhenContext } from "./types";

interface PreparedBinding {
  original: Keybinding;
  parsed: ParsedHotkey;
  /** when-clause evaluator; `null` = unconditional (always active). */
  evaluate: WhenEvaluator | null;
  /** True when a when clause failed to compile — never matches. */
  broken: boolean;
}
const OVERRIDES_STORAGE_KEY = "basalt.hotkey-overrides";


export class KeybindingService {
  private bindings: Keybinding[];
  private context: WhenContext = {};
  private actions = new Map<string, () => void>();
  /** Parsed + compiled cache; rebuilt only when bindings change. */
  private prepared: PreparedBinding[];
  /** Custom per-command hotkey overrides, persisted to localStorage. */
  private customBindings = new Map<string, string>();
  /** Commands whose keybinding is explicitly removed. */
  private unbound = new Set<string>();


  constructor() {
    this.bindings = KEYBINDINGS.map((b) => ({ ...b }));
    this.prepared = [];
    this.loadOverrides();
    this.rebuild();
  }

  private rebuild(): void {
    this.prepared = this.getBindings().map((b) => {
      const evaluate = b.when ? parseWhen(b.when) : null;
      const broken =
        b.when !== undefined && b.when.trim() !== "" && evaluate === null;
      if (broken) {
        console.warn(
          `[keybindings] invalid when clause "${b.when}" in binding "${b.key}" — it will never match`,
        );
      }
      return {
        original: b,
        parsed: parseHotkey(b.key),
        evaluate,
        broken,
      };
    });
  }


  register(binding: Keybinding): void {
    this.bindings.push(binding);
    this.rebuild();
  }

  unregister(key: string): void {
    this.bindings = this.bindings.filter((b) => b.key !== key);
    this.rebuild();
  }

  /**
   * Effective bindings: defaults with per-command custom overrides applied,
   * unbound commands removed. Used by the matcher and the Hotkeys UI.
   */
  getBindings(): Keybinding[] {
    return this.bindings
      .filter((b) => !b.command || !this.unbound.has(b.command))
      .map((b) =>
        b.command && this.customBindings.has(b.command)
          ? { ...b, key: this.customBindings.get(b.command)! }
          : b,
      );
  }

  /** Effective hotkey bound to a command, or undefined when unbound. */
  bindingForCommand(commandId: string): Keybinding | undefined {
    return this.getBindings().find((b) => b.command === commandId);
  }

  /**
   * Command whose effective binding collides with `key` (same key + same
   * modifiers), excluding `excludeCommand`. Undefined = free.
   */
  conflictsWith(key: string, excludeCommand?: string): string | undefined {
    const candidate = parseHotkey(key);
    if (!candidate.key) return undefined;
    for (const b of this.getBindings()) {
      if (!b.command || b.command === excludeCommand) continue;
      const other = parseHotkey(b.key);
      if (
        other.key === candidate.key &&
        other.cmdOrCtrl === candidate.cmdOrCtrl &&
        other.shift === candidate.shift &&
        other.alt === candidate.alt
      ) {
        return b.command;
      }
    }
    return undefined;
  }

  /**
   * Replace a command's keybinding. Validates the hotkey, persists the
   * override, rebuilds the matcher cache, and reports conflicts (which
   * are allowed — resolution is most-specific-first).
   */
  setCustomBinding(
    commandId: string,
    key: string,
  ): { ok: true; conflict?: string } | { ok: false; error: string } {
    if (!parseHotkey(key).key) {
      return { ok: false, error: `Invalid hotkey "${key}".` };
    }
    this.customBindings.set(commandId, key);
    this.unbound.delete(commandId);
    this.persistOverrides();
    this.rebuild();
    const conflict = this.conflictsWith(key, commandId);
    return conflict ? { ok: true, conflict } : { ok: true };
  }

  /** Remove a command's keybinding entirely (no default fallback). */
  unbind(commandId: string): void {
    if (!this.unbound.has(commandId) && !this.customBindings.has(commandId)) {
      return;
    }
    this.unbound.add(commandId);
    this.customBindings.delete(commandId);
    this.persistOverrides();
    this.rebuild();
  }

  /** Restore a command to its default keybinding. */
  resetBinding(commandId: string): void {
    if (!this.unbound.has(commandId) && !this.customBindings.has(commandId)) {
      return;
    }
    this.unbound.delete(commandId);
    this.customBindings.delete(commandId);
    this.persistOverrides();
    this.rebuild();
  }

  /** True when the command deviates from its default keybinding. */
  hasCustomBinding(commandId: string): boolean {
    return this.unbound.has(commandId) || this.customBindings.has(commandId);
  }

  private loadOverrides(): void {
    try {
      const raw =
        typeof localStorage === "undefined"
          ? null
          : localStorage.getItem(OVERRIDES_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        overrides?: Record<string, string>;
        unbound?: string[];
      };
      for (const [id, key] of Object.entries(data.overrides ?? {})) {
        if (typeof key === "string" && parseHotkey(key).key) {
          this.customBindings.set(id, key);
        }
      }
      for (const id of data.unbound ?? []) this.unbound.add(id);
    } catch {
      // Corrupt override storage is ignored; defaults apply.
    }
  }

  private persistOverrides(): void {
    try {
      localStorage.setItem(
        OVERRIDES_STORAGE_KEY,
        JSON.stringify({
          overrides: Object.fromEntries(this.customBindings),
          unbound: Array.from(this.unbound),
        }),
      );
    } catch {
      // Storage unavailable — in-memory overrides still apply this session.
    }
  }

  registerAction(name: string, handler: () => void): void {
    this.actions.set(name, handler);
  }

  unregisterAction(name: string): void {
    this.actions.delete(name);
  }

  setContext(key: string, value: ContextValue): void {
    this.context[key] = value;
  }

  removeContext(key: string): void {
    delete this.context[key];
  }

  updateContext(values: Partial<WhenContext>): void {
    Object.assign(this.context, values);
  }

  getContext(): Readonly<WhenContext> {
    return { ...this.context };
  }

  evaluateWhen(when?: string): boolean {
    if (!when) return true;
    const evaluator = parseWhen(when);
    if (!evaluator) return false;
    return evaluator(this.context);
  }

  resolve(event: KeyboardEvent): Keybinding | null {
    const candidates: PreparedBinding[] = [];

    for (const binding of this.prepared) {
      const keyMatch = event.key.toLowerCase() === binding.parsed.key;
      const modMatch = binding.parsed.cmdOrCtrl
        ? event.ctrlKey || event.metaKey
        : !event.ctrlKey && !event.metaKey;
      const shiftMatch = binding.parsed.shift
        ? event.shiftKey
        : !event.shiftKey;
      const altMatch = binding.parsed.alt ? event.altKey : !event.altKey;

      if (!keyMatch || !modMatch || !shiftMatch || !altMatch) continue;
      if (binding.broken) continue;
      if (
        binding.original.command &&
        !commandService.hasCommand(binding.original.command)
      )
        continue;
      if (binding.original.action && !this.actions.has(binding.original.action))
        continue;

      candidates.push(binding);
    }

    // Most-specific match wins: a binding whose when-clause evaluates true
    // beats an unconditional one; unconditional bindings are the fallback.
    for (const binding of candidates) {
      if (binding.evaluate && binding.evaluate(this.context))
        return binding.original;
    }
    for (const binding of candidates) {
      if (!binding.evaluate) return binding.original;
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
    const binding = this.resolve(event);
    if (!binding) return false;
    event.preventDefault();
    this.execute(binding);
    return true;
  }
}

export const keybindingService = new KeybindingService();
