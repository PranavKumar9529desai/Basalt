import { describe, expect, it } from "vitest";
import type { EditorView } from "@codemirror/view";
import { attachScrollHeader } from "@workspace/editor";

/**
 * Smoke test for the scroller-title insertion (ADR-023). Uses a lightweight
 * fake view (dom + scrollDOM) so no real CodeMirror instance or layout pass
 * is needed in jsdom.
 */
function fakeView(): {
  view: EditorView;
  editorDom: HTMLElement;
  scrollDOM: HTMLElement;
  content: HTMLElement;
} {
  const editorDom = document.createElement("div");
  const scrollDOM = document.createElement("div");
  const content = document.createElement("div");
  content.className = "cm-content";
  scrollDOM.appendChild(content);
  editorDom.appendChild(scrollDOM);
  return {
    view: { dom: editorDom, scrollDOM } as unknown as EditorView,
    editorDom,
    scrollDOM,
    content,
  };
}

describe("attachScrollHeader", () => {
  it("injects the slot as the first child of .cm-scroller, before .cm-content", () => {
    const { view, scrollDOM, content } = fakeView();
    const slot = document.createElement("div");
    const detach = attachScrollHeader(view, slot);

    expect(scrollDOM.firstChild).toBe(slot);
    expect([...scrollDOM.children]).toEqual([slot, content]);
    expect(slot.classList.contains("cm-scroller-title")).toBe(true);
    // Layout flag enables the column-direction flex override in the theme.
    expect(view.dom.getAttribute("data-basalt-title")).toBe("true");
    detach();
  });

  it("restores the DOM to its original children on detach", () => {
    const { view, scrollDOM, content } = fakeView();
    const slot = document.createElement("div");
    const detach = attachScrollHeader(view, slot);
    detach();

    expect([...scrollDOM.children]).toEqual([content]);
    expect(view.dom.hasAttribute("data-basalt-title")).toBe(false);
  });

  it("removes the slot from the DOM even if called repeatedly", () => {
    const { view, scrollDOM, content } = fakeView();
    const slot = document.createElement("div");
    const detachA = attachScrollHeader(view, slot);
    const detachB = attachScrollHeader(view, slot);
    detachA();
    detachB();

    expect([...scrollDOM.children]).toEqual([content]);
    expect(view.dom.hasAttribute("data-basalt-title")).toBe(false);
  });
});
