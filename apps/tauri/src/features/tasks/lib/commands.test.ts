import { describe, expect, it, beforeEach, afterEach } from "vitest";
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
  runQuery: async () => ({
    columns: [],
    rows: [],
    total: 0,
    elapsedMs: 0,
  }),
  runTasksQuery: async () => ({
    columns: [],
    rows: [],
    total: 0,
    elapsedMs: 0,
  }),
  parseFrontmatter: () => null,
  editFrontmatter: () => {},
};

function buildView(doc: string, anchor: number) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const groups = createEditorExtensionGroups(config);
  const extensions = [
    ...groups.base,
    ...groups.syntax,
    ...groups.input,
    ...groups.livePreview,
    ...groups.suggestions,
    ...groups.links,
    ...groups.blockWidgets,
  ];
  const view = new EditorView({
    doc,
    parent,
    selection: { anchor },
    extensions,
  });
  return { view, parent };
}

describe("tasks:toggle with full real extension group", () => {
  beforeEach(() => registerTaskCommands());
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("toggles when cursor is at the end of a task line with signifiers", () => {
    // Modal create flow leaves the cursor at the end of the inserted line,
    // which includes signifier text.
    const doc = "- [ ] Buy milk \u{1F4C5}2026-09-12";
    const { view, parent } = buildView(doc, doc.length);
    view.focus();
    commandService.execute("tasks:toggle");
    expect(view.state.doc.toString()).toBe(
      "- [x] Buy milk \u{1F4C5}2026-09-12",
    );
    parent.remove();
  });

  it("syntax tree has TaskMarker at cursor's line in full stack", () => {
    const doc = "- [ ] Buy milk";
    const { view, parent } = buildView(doc, doc.length);
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const names: string[] = [];
    syntaxTree(view.state).iterate({
      from: line.from,
      to: line.to,
      enter: (n) => {
        names.push(n.type.name);
      },
    });
    expect(names).toContain("TaskMarker");
    parent.remove();
  });
});
