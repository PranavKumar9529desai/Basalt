import { afterEach, describe, expect, it, vi } from "vitest";
import { editorControllerRegistry } from "./registry";
import type { EditorController } from "./controller/EditorController";

function fakeController(): EditorController {
  // The registry only stores and hands back controllers — no behavior is
  // exercised through it — so a structurally-typed stub is sufficient.
  return {} as EditorController;
}

const PANES = ["pane-a", "pane-b", "pane-c"] as const;

describe("editorControllerRegistry", () => {
  afterEach(() => {
    for (const pane of PANES) editorControllerRegistry.unregister(pane);
  });

  it("stores and returns controllers per pane", () => {
    const a = fakeController();
    const b = fakeController();
    editorControllerRegistry.register("pane-a", a);
    editorControllerRegistry.register("pane-b", b);

    expect(editorControllerRegistry.get("pane-a")).toBe(a);
    expect(editorControllerRegistry.get("pane-b")).toBe(b);
    expect(editorControllerRegistry.get("pane-c")).toBeUndefined();
  });

  it("keyed unregister removes only the matching pane's controller", () => {
    const a = fakeController();
    const b = fakeController();
    editorControllerRegistry.register("pane-a", a);
    editorControllerRegistry.register("pane-b", b);

    editorControllerRegistry.unregister("pane-a");

    expect(editorControllerRegistry.get("pane-a")).toBeUndefined();
    expect(editorControllerRegistry.get("pane-b")).toBe(b);
  });

  it("re-registering a pane overwrites with the new controller", () => {
    const first = fakeController();
    const second = fakeController();
    editorControllerRegistry.register("pane-a", first);
    editorControllerRegistry.register("pane-a", second);

    expect(editorControllerRegistry.get("pane-a")).toBe(second);
  });

  it("notifies subscribers on register and unregister", () => {
    const listener = vi.fn();
    const unsubscribe = editorControllerRegistry.subscribe(listener);
    const controller = fakeController();

    editorControllerRegistry.register("pane-a", controller);
    expect(listener).toHaveBeenCalledTimes(1);

    editorControllerRegistry.unregister("pane-a");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    editorControllerRegistry.register("pane-a", controller);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});