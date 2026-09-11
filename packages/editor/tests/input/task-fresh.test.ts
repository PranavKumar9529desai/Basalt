/**
 * Fresh-task capture trigger (Obsidian Tasks parity).
 *
 * Typing an empty `- [ ]` checkbox fires `onFreshTaskChange(line)` exactly
 * once; leaving the line (typing a description, moving off it) fires `null`.
 * Checkboxes inside code blocks must never trigger.
 */
import { afterEach, describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { freshTaskExtension } from "../../src/input/task-fresh";

function buildView(
  doc: string,
  onChange: (line: number | null) => void,
  selection?: number,
) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    doc,
    parent,
    selection: selection !== undefined ? { anchor: selection } : { anchor: 0 },
    extensions: [
      markdown({ base: markdownLanguage }),
      freshTaskExtension(onChange),
    ],
  });
  return { view, parent };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("freshTaskExtension", () => {
  it("fires once when an empty `- [ ]` line is typed, then null on description", () => {
    const calls: (number | null)[] = [];
    const { view } = buildView("", (line) => calls.push(line));

    view.dispatch({
      changes: { from: 0, insert: "- [ ] " },
      selection: { anchor: 6 },
    });
    expect(calls).toEqual([1]);

    view.dispatch({
      changes: { from: 6, insert: "buy milk" },
      selection: { anchor: 14 },
    });
    expect(calls).toEqual([1, null]);
  });

  it("recognizes `* [ ]` and ordered checkboxes", () => {
    const calls: (number | null)[] = [];
    const { view } = buildView("seed", (line) => calls.push(line));

    view.dispatch({
      changes: { from: 4, insert: "\n* [ ] " },
      selection: { anchor: 4 + "\n* [ ] ".length },
    });
    expect(calls).toEqual([2]);

    view.dispatch({
      changes: { from: 0, insert: "1. [ ]\n", to: 0 },
      selection: { anchor: 6 },
    });
    expect(calls).toContain(1);
  });

  it("does not fire for a checkbox inside a fenced code block", () => {
    const calls: (number | null)[] = [];
    buildView("```\n- [ ]\n```", (line) => calls.push(line), 7);
    expect(calls).toEqual([]);
  });

  it("returns an inert extension when no callback is wired", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      doc: "- [ ] ",
      parent,
      extensions: [markdown({ base: markdownLanguage }), freshTaskExtension()],
    });
    view.dispatch({
      changes: { from: 6, insert: "x" },
      selection: { anchor: 7 },
    });
    parent.remove();
  });
});