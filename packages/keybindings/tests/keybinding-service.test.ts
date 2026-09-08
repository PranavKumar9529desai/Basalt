import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commandService } from "@workspace/commands";
import { KeybindingService } from "../src/keybinding-service";
import type { Keybinding } from "../src/types";

function ctrlKey(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, ctrlKey: true });
}

describe("KeybindingService — when-clause resolution", () => {
  let service: KeybindingService;
  const onAction = vi.fn();

  beforeEach(() => {
    service = new KeybindingService();
    onAction.mockReset();
  });

  afterEach(() => {
    // Remove test commands registered on the shared singleton.
    commandService.unregister("test:cmd");
  });

  it("a binding whose when-clause is true beats an unconditional same-key binding", () => {
    service.registerAction("gated", onAction);
    service.registerAction("fallback", onAction);
    service.register({
      key: "Ctrl+B",
      when: "editorFocused",
      action: "gated",
    });
    service.register({ key: "Ctrl+B", action: "fallback" });

    service.setContext("editorFocused", true);
    const gated = service.resolve(ctrlKey("b"));
    expect(gated?.action).toBe("gated");

    service.setContext("editorFocused", false);
    const fallback = service.resolve(ctrlKey("b"));
    expect(fallback?.action).toBe("fallback");
  });

  it("falls through to an unconditional binding when no when-clause matches", () => {
    service.registerAction("a", onAction);
    service.registerAction("b", onAction);
    service.register({
      key: "Ctrl+1",
      when: "viewMode == 'reading'",
      action: "a",
    });
    service.register({ key: "Ctrl+1", action: "b" });

    expect(service.resolve(ctrlKey("1"))?.action).toBe("b");
    service.setContext("viewMode", "reading");
    expect(service.resolve(ctrlKey("1"))?.action).toBe("a");
  });

  it("does not fall back when only conditional bindings exist and none match", () => {
    service.registerAction("a", onAction);
    service.register({ key: "Ctrl+2", when: "modalOpen", action: "a" });
    expect(service.resolve(ctrlKey("2"))).toBeNull();
  });

  it("a broken when clause never matches and an unconditional twin wins", () => {
    service.registerAction("broken", onAction);
    service.registerAction("ok", onAction);
    service.register({ key: "Ctrl+3", when: "modalOpen &&", action: "broken" });
    service.register({ key: "Ctrl+3", action: "ok" });

    service.setContext("modalOpen", true);
    expect(service.resolve(ctrlKey("3"))?.action).toBe("ok");
  });

  it("compiled negated when-clauses gate on their key", () => {
    service.registerAction("acc", onAction);
    service.register({ key: "Ctrl+4", when: "!(modalOpen)", action: "acc" });

    // modalOpen absent ⇒ !modalOpen is true ⇒ binding matches.
    expect(service.resolve(ctrlKey("4"))?.action).toBe("acc");
    service.setContext("modalOpen", true);
    expect(service.resolve(ctrlKey("4"))).toBeNull();
    service.setContext("modalOpen", false);
    expect(service.resolve(ctrlKey("4"))?.action).toBe("acc");
  });

  it("handleKeydown executes a matching action and prevents default", () => {
    const handler = vi.fn();
    const event = ctrlKey("5");
    const preventDefault = vi.spyOn(event, "preventDefault");
    service.registerAction("x", handler);
    service.register({ key: "Ctrl+5", action: "x" });

    expect(service.handleKeydown(event)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("handleKeydown returns false without preventDefault when nothing matches", () => {
    const event = ctrlKey("9");
    const preventDefault = vi.spyOn(event, "preventDefault");
    expect(service.handleKeydown(event)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("executes command bindings through the command service", () => {
    const callback = vi.fn();
    commandService.registerCommand("search:open", callback);
    service.register({ key: "Ctrl+6", command: "search:open" });

    const binding = service.resolve(ctrlKey("6"));
    expect(binding?.command).toBe("search:open");
    service.execute(binding as Keybinding);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("skips command bindings whose command is not registered", () => {
    service.register({ key: "Ctrl+7", command: "test:never-registered" });
    expect(service.resolve(ctrlKey("7"))).toBeNull();
  });
});

describe("KeybindingService — custom bindings (Hotkeys section)", () => {
  let service: KeybindingService;

  function registerHotkeyCmd(id: string) {
    commandService.register({ id, name: id, callback: () => {} });
  }

  beforeEach(() => {
    // Stub localStorage so override persistence round-trips like the webview.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    });
    service = new KeybindingService();
    registerHotkeyCmd("hotkey:one");
    registerHotkeyCmd("hotkey:two");
  });

  afterEach(() => {
    commandService.unregister("hotkey:one");
    commandService.unregister("hotkey:two");
    vi.unstubAllGlobals();
  });

  it("assigns a custom binding and the matcher resolves the new key", () => {
    service.register({ key: "CmdOrCtrl+J", command: "hotkey:one" });
    const result = service.setCustomBinding("hotkey:one", "CmdOrCtrl+K");

    expect(result).toEqual({ ok: true });
    expect(service.bindingForCommand("hotkey:one")?.key).toBe("CmdOrCtrl+K");
    expect(service.handleKeydown(ctrlKey("k"))).toBe(true);
    expect(service.handleKeydown(ctrlKey("j"))).toBe(false);
  });

  it("rejects a hotkey with no key portion", () => {
    expect(service.setCustomBinding("hotkey:one", "CmdOrCtrl+")).toEqual({
      ok: false,
      error: 'Invalid hotkey "CmdOrCtrl+".',
    });
  });

  it("reports conflicts between equal modifier/key combinations", () => {
    service.register({ key: "CmdOrCtrl+J", command: "hotkey:one" });
    service.register({ key: "CmdOrCtrl+K", command: "hotkey:two" });

    const result = service.setCustomBinding("hotkey:two", "CmdOrCtrl+J");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.conflict).toBe("hotkey:one");
    }
  });

  it("unbind removes the binding; reset restores the default", () => {
    service.register({ key: "CmdOrCtrl+J", command: "hotkey:one" });
    service.setCustomBinding("hotkey:one", "CmdOrCtrl+K");

    service.unbind("hotkey:one");
    expect(service.bindingForCommand("hotkey:one")).toBeUndefined();
    expect(service.handleKeydown(ctrlKey("k"))).toBe(false);

    service.resetBinding("hotkey:one");
    expect(service.bindingForCommand("hotkey:one")?.key).toBe("CmdOrCtrl+J");
  });

  it("persists overrides so a fresh service instance restores them", () => {
    // `search:open` ships a default binding (CmdOrCtrl+F) in keybindings.json,
    // so it exists on every fresh service instance.
    service.setCustomBinding("search:open", "CmdOrCtrl+K");

    const reloaded = new KeybindingService();
    expect(reloaded.bindingForCommand("search:open")?.key).toBe("CmdOrCtrl+K");
  });
});
