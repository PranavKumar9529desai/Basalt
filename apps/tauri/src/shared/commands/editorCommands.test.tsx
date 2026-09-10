/**
 * Find & Replace commands (Phase 3): editor:find / editor:replace resolve the
 * ACTIVE editor at execution time and open the CM6 search panel. The
 * keybinding manifest rebinds Cmd+F (editor-scoped now, Obsidian parity) and
 * adds Cmd+Shift+F as the global-search entry + Cmd+H for replace.
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorExtensions } from "@workspace/editor";
import { commandService } from "@workspace/commands";
import { keybindingService } from "@workspace/keybindings";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTabsStore } from "../../features/tabs";
import { editorControllerRegistry } from "../../features/editor";
import { resolveActiveController } from "../activeEditor";
import "./editorCommands"; // side-effect: registers commands + key actions

function mountActiveEditor(doc: string): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: createEditorExtensions({}),
    }),
    parent,
  });
  const fakeController = { getView: () => view } as unknown as Parameters<
    typeof editorControllerRegistry.register
  >[1];
  useTabsStore.setState({ activePaneId: "search-test-pane" });
  editorControllerRegistry.register("search-test-pane", fakeController);
  return view;
}

describe("editor:find / editor:replace", () => {
  let view: EditorView;

  beforeEach(() => {
    view = mountActiveEditor("alpha beta\nsecond alpha");
  });

  afterEach(() => {
    editorControllerRegistry.unregister("search-test-pane");
    view.destroy();
    document.body.innerHTML = "";
  });

  it("editor:find opens the search panel on the active editor", () => {
    expect(resolveActiveController()?.getView()).toBe(view);
    expect(view.dom.querySelector(".cm-search")).toBeNull();

    commandService.execute("editor:find");

    expect(view.dom.querySelector(".cm-search")).not.toBeNull();
  });

  it("editor:replace opens the panel and focuses the replace field", () => {
    commandService.execute("editor:replace");

    const panel = view.dom.querySelector<HTMLDivElement>(".cm-search");
    expect(panel).not.toBeNull();
    const replace = panel?.querySelector<HTMLInputElement>(
      'input[name="replace"]',
    );
    expect(replace).not.toBeNull();
    expect(document.activeElement).toBe(replace);
  });

  it("keybinding manifest: Cmd+F → editor:find when editor focused", () => {
    const binding = keybindingService.bindingForCommand("editor:find");
    expect(binding?.key).toBe("CmdOrCtrl+F");
    expect(binding?.when).toBe("editorFocused");
  });

  it("keybinding manifest: Cmd+Shift+F → global search, Cmd+H → replace", () => {
    expect(keybindingService.bindingForCommand("search:open")?.key).toBe(
      "CmdOrCtrl+Shift+F",
    );
    const replace = keybindingService.bindingForCommand("editor:replace");
    expect(replace?.key).toBe("CmdOrCtrl+H");
    expect(replace?.when).toBe("editorFocused");
  });
});
