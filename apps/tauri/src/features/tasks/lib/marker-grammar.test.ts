import { describe, expect, it, afterEach } from "vitest";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import {
  createEditorExtensionGroups,
  type EditorConfig,
} from "@workspace/editor";
import { commandService } from "@workspace/commands";
import { registerTaskCommands } from "../lib/commands";

const config: EditorConfig = {
  onFetchLinks: async () => [],
  onFetchTags: async () => [],
  onOpenLink: () => {},
  onOpenTag: () => {},
  resolveAsset: () => null,
  runQuery: async () => ({ columns: [], rows: [], total: 0, elapsedMs: 0 }),
  runTasksQuery: async () => ({
    columns: [],
    rows: [],
    total: 0,
    elapsedMs: 0,
  }),
  parseFrontmatter: () => null,
  editFrontmatter: () => {},
};

function buildView(doc: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const groups = createEditorExtensionGroups(config);
  const view = new EditorView({
    doc,
    parent,
    selection: { anchor: doc.length },
    extensions: [
      ...groups.base,
      ...groups.syntax,
      ...groups.input,
      ...groups.livePreview,
      ...groups.suggestions,
      ...groups.links,
      ...groups.blockWidgets,
    ],
  });
  view.focus();
  return { view, parent };
}

function markerOnCursorLine(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  let found = false;
  syntaxTree(view.state).iterate({
    from: line.from,
    to: line.to,
    enter: (n) => {
      if (n.type.name === "TaskMarker") found = true;
    },
  });
  return found;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe.each([
  ["todo", "- [ ] Todo item", "- [x] Todo item"],
  ["in_progress", "- [/] In progress item", "- [x] In progress item"],
  ["on_hold", "- [?] On hold item", "- [x] On hold item"],
  ["done", "- [x] Done item", "- [ ] Done item"],
  ["done-uppercase", "- [X] Done item", "- [ ] Done item"],
  ["cancelled", "- [-] Cancelled item", "- [ ] Cancelled item"],
] as const)("tasks:toggle on a %s line", (_, input, expected) => {
  it("parses a TaskMarker and fast-toggles done/todo", () => {
    registerTaskCommands();
    const { view, parent } = buildView(input);
    expect(markerOnCursorLine(view)).toBe(true);
    commandService.execute("tasks:toggle");
    expect(view.state.doc.toString()).toBe(expected);
    view.destroy();
    parent.remove();
  });
});

describe.each([
  ["todo", "- [ ] Item", "- [/] Item"],
  ["in_progress", "- [/] Item", "- [x] Item"],
  ["on_hold", "- [?] Item", "- [ ] Item"],
  ["cancelled", "- [-] Item", "- [ ] Item"],
] as const)("tasks:cycle-status on a %s line", (_, input, expected) => {
  it("cycles to the next status", () => {
    registerTaskCommands();
    const { view, parent } = buildView(input);
    commandService.execute("tasks:cycle-status");
    expect(view.state.doc.toString()).toBe(expected);
    view.destroy();
    parent.remove();
  });
});
