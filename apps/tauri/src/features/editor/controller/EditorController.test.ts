import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { LeafServices, LeafTabInfo } from "@workspace/views";
import { describe, expect, it, vi } from "vitest";
import {
  EditorController,
  type EditorControllerOptions,
  type NoteIO,
} from "./EditorController";

// showTab awaits the frontmatter WASM loader, which can't resolve in vitest's
// SSR build (the `?init` import is a Vite-only URL). Stub it to resolve
// immediately so showTab's read-then-swap flow is what actually runs.
vi.mock("../logic/frontmatter-wasm", () => ({
  initFrontmatterWasm: vi.fn().mockResolvedValue(undefined),
}));

function makeFakeView(doc = ""): {
  view: EditorView;
  lastState: { current: EditorState };
  scrollTop: { current: number };
} {
  const state = EditorState.create({ doc, extensions: [] });
  // Boxes so assertions read the CURRENT state/scroll, which setState mutates.
  const lastState = { current: state };
  const scrollTop = { current: 0 };
  const fake = {
    state,
    scrollDOM: {
      get scrollTop() {
        return scrollTop.current;
      },
      set scrollTop(v: number) {
        scrollTop.current = v;
      },
    },
    setState(newState: EditorState) {
      lastState.current = newState;
      fake.state = newState;
    },
    dispatch(spec: { selection: { anchor: number } }) {
      void spec.selection.anchor;
    },
  };
  return { view: fake as unknown as EditorView, lastState, scrollTop };
}

function makeStubServices(overrides: Partial<LeafServices> = {}): LeafServices {
  return {
    openNote: vi.fn(),
    markTabDirty: vi.fn(),
    findNote: vi.fn(),
    getOpenTabIds: () => new Set(),
    getOpenTabPaths: () => new Set(),
    getTabInfo: () => null,
    onTabStructureChanged: () => () => {},
    activeNote: null,
    openPinned: () => "",
    renameNote: vi.fn(),
    ...overrides,
  } as LeafServices;
}

function makeController(
  currentTab: LeafTabInfo | null,
  ioOverrides: Partial<NoteIO> = {},
) {
  const io: NoteIO = {
    readFile: vi.fn().mockResolvedValue("disk content"),
    saveFile: vi.fn().mockResolvedValue(undefined),
    refreshBacklinks: vi.fn().mockResolvedValue(undefined),
    setStatus: vi.fn(),
    setSaveStatus: vi.fn(),
    onFetchLinks: vi.fn().mockResolvedValue([]),
    onFetchTags: vi.fn().mockResolvedValue([]),
    parseFrontmatter: () => null,
    ...ioOverrides,
  };
  const services = makeStubServices();
  const keybindingService = {
    registerAction: vi.fn(),
    unregisterAction: vi.fn(),
    setContext: vi.fn(),
  } as unknown as EditorControllerOptions["keybindingService"];

  const controller = new EditorController({
    io,
    services,
    keybindingService,
    currentTab,
    setContextMenuState: () => {},
    onStatus: io.setStatus,
  });
  return { controller, io, services };
}

const tabA: LeafTabInfo = { id: "tab-a", path: "/v/a.md", title: "a", line: 2 };
const tabB: LeafTabInfo = { id: "tab-b", path: "/v/b.md", title: "b" };

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("EditorController", () => {
  it("shows the active tab by reading disk into a fresh EditorState", async () => {
    const { controller, io } = makeController(tabA);
    const { view, lastState } = makeFakeView();

    controller.setView(view);
    await tick();

    expect(io.readFile).toHaveBeenCalledWith(tabA.path);
    expect(controller.getView()).toBe(view);
    expect(lastState.current.doc.toString()).toBe("disk content");
  });

  it("restores the cached state (no second disk read) for a previously-shown tab", async () => {
    const { controller, io } = makeController(tabA);
    const { view, lastState } = makeFakeView();
    controller.setView(view);
    await tick();

    io.readFile = vi.fn();
    await controller.showTab(tabA);
    expect(io.readFile).not.toHaveBeenCalled();
    expect(lastState.current.doc.toString()).toBe("disk content");
  });

  it("does not apply a read that resolves after the tab switched away", async () => {
    // A is active and loaded. Start B's read, switch back to A BEFORE B's
    // read resolves — the view must stay on A (B's content is stale).
    const { controller, io } = makeController(tabA);
    const { view, lastState } = makeFakeView();
    controller.setView(view);
    await tick(); // A loads

    let resolveB!: (s: string) => void;
    io.readFile = vi.fn(
      () => new Promise<string>((res) => (resolveB = res)),
    );

    controller.setCurrentTab(tabB);
    const pendingShow = controller.showTab(tabB);
    controller.setCurrentTab(tabA); // switch away before the read lands
    resolveB("b content");

    await pendingShow;
    await tick();

    expect(io.readFile).toHaveBeenCalledTimes(1);
    expect(lastState.current.doc.toString()).toBe("disk content"); // A shown
  });

  it("revealLine clamps the jump target to valid lines", async () => {
    const { controller } = makeController(tabA);
    const { view } = makeFakeView("l1\nl2\nl3");
    controller.setView(view);
    await tick();

    expect(() => controller.revealLine(2)).not.toThrow();
    expect(() => controller.revealLine(999)).not.toThrow();
    expect(() => controller.revealLine(-5)).not.toThrow();
  });

  it("saveTab on the ACTIVE tab writes the live doc and reports 'saving'", async () => {
    const { controller, io } = makeController(tabA);
    const { view } = makeFakeView();
    controller.setView(view);
    await tick(); // A lands in the cache
    io.setSaveStatus = vi.fn();

    await controller.saveTab(tabA.id);

    expect(io.saveFile).toHaveBeenCalledWith(tabA.path, "disk content");
    expect(io.setSaveStatus).toHaveBeenCalledWith("saving");
    expect(io.setSaveStatus).toHaveBeenLastCalledWith("saved");
  });

  it("saveTab on a BACKGROUND tab uses the cached doc and no saving banner", async () => {
    const { controller, io } = makeController(tabA);
    const { view } = makeFakeView();
    controller.setView(view);
    await tick(); // A loads

    // B becomes active, loads, then the user switches back to A — B is now
    // a background tab with cached state.
    io.readFile = vi.fn().mockResolvedValue("b content");
    controller.setCurrentTab(tabB);
    await controller.showTab(tabB);
    controller.setCurrentTab(tabA);
    io.setSaveStatus = vi.fn();

    await controller.saveTab(tabB.id);

    expect(io.saveFile).toHaveBeenCalledWith(tabB.path, "b content");
    expect(io.setSaveStatus).not.toHaveBeenCalledWith("saving");
    expect(io.setSaveStatus).toHaveBeenCalledTimes(0);
  });
});