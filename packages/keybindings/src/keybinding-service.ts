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

export class KeybindingService {
  private bindings: Keybinding[];
  private context: WhenContext = {};
  private actions = new Map<string, () => void>();
  /** Parsed + compiled cache; rebuilt only when bindings change. */
  private prepared: PreparedBinding[];

  constructor() {
    this.bindings = KEYBINDINGS.map((b) => ({ ...b }));
    this.prepared = [];
    this.rebuild();
  }

  private rebuild(): void {
    this.prepared = this.bindings.map((b) => {
      const evaluate = b.when ? parseWhen(b.when) : null;
      const broken = b.when !== undefined && b.when.trim() !== "" && evaluate === null;
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
      if (binding.evaluate && binding.evaluate(this.context)) return binding.original;
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
