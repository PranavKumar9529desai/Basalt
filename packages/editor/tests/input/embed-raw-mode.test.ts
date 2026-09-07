import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  setEmbedRawMode,
  embedRawModeField,
  isEmbedInRawMode,
  createEditorExtensions,
} from "../../src";

describe("Asset Embed Raw Mode & Toggle", () => {
  it("updates state field when setEmbedRawMode is dispatched", () => {
    const state = EditorState.create({
      doc: "![[image.png]]",
      extensions: [embedRawModeField],
    });

    expect(isEmbedInRawMode(state, 0, 14)).toBe(false);

    const tr = state.update({
      effects: setEmbedRawMode.of({ from: 0, to: 14 }),
    });
    expect(isEmbedInRawMode(tr.state, 0, 14)).toBe(true);

    const cleared = tr.state.update({
      effects: setEmbedRawMode.of(null),
    });
    expect(isEmbedInRawMode(cleared.state, 0, 14)).toBe(false);
  });

  it("auto-clears raw mode when selection moves outside the embed span", () => {
    const state = EditorState.create({
      doc: "![[image.png]]\n\nSome text below",
      extensions: [embedRawModeField],
      selection: { anchor: 5 },
    });

    const setTr = state.update({
      effects: setEmbedRawMode.of({ from: 0, to: 14 }),
    });
    expect(isEmbedInRawMode(setTr.state, 0, 14)).toBe(true);

    // Move cursor to line 3 (pos 18)
    const moveTr = setTr.state.update({
      selection: { anchor: 18 },
    });
    expect(isEmbedInRawMode(moveTr.state, 0, 14)).toBe(false);
  });

  it("renders code toggle button in EmbedMediaWidget DOM and dispatches raw mode effect when clicked", () => {
    const doc = "![[image.png]]";
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          createEditorExtensions({
            resolveAsset: (target) =>
              target === "image.png" ? "asset:///vault/image.png" : null,
          }),
        ],
      }),
      parent,
    });

    const mediaEl = view.dom.querySelector(".cm-embed-media");
    expect(mediaEl).not.toBeNull();

    const codeBtn = mediaEl?.querySelector(
      ".cm-code-btn-toggle",
    ) as HTMLButtonElement;
    expect(codeBtn).not.toBeNull();
    expect(codeBtn.title).toBe("Edit as raw Markdown");

    // Simulate clicking the code toggle button
    const mousedownEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    codeBtn.dispatchEvent(mousedownEvent);

    expect(isEmbedInRawMode(view.state, 0, 14)).toBe(true);

    view.destroy();
    parent.remove();
  });

  it("shows clean raw text when in raw mode and restores media when cleared", () => {
    const doc = "![[image.png]]";
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          createEditorExtensions({
            resolveAsset: (target) =>
              target === "image.png" ? "asset:///vault/image.png" : null,
          }),
        ],
      }),
      parent,
    });

    // Enable raw mode
    view.dispatch({
      effects: setEmbedRawMode.of({ from: 0, to: 14 }),
    });

    // In raw mode, media widget should be hidden (raw text revealed)
    const mediaEl = view.dom.querySelector(".cm-embed-media");
    expect(mediaEl).toBeNull();

    // Clear raw mode
    view.dispatch({
      effects: setEmbedRawMode.of(null),
    });

    expect(isEmbedInRawMode(view.state, 0, 14)).toBe(false);
    expect(view.dom.querySelector(".cm-embed-media")).not.toBeNull();

    view.destroy();
    parent.remove();
  });
});
