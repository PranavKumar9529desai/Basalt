/**
 * Reading-mode link handling (ADR-029). External http(s) links must route
 * through the injected `openExternalLinkFacet` (Tauri system browser) — never
 * `window.open`, which behaves wrongly inside a WebView. Internal/anchor links
 * and wikilinks keep their existing paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readingExtensions } from "../src/editor";

function buildView(openExternalLink?: (url: string) => void) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: "[External](https://example.com/page)",
      extensions: [
        readingExtensions({
          openExternalLink,
        }),
      ],
    }),
    parent,
  });
  return { view, parent };
}

function clickAnchor(view: EditorView, href: string) {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  anchor.textContent = href;
  view.contentDOM.appendChild(anchor);
  anchor.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }),
  );
  anchor.remove();
}

describe("reading-mode external link routing", () => {
  const spyList: EditorView[] = [];
  const spyOpen = vi.fn<(url: string) => void>();

  beforeEach(() => {
    spyOpen.mockClear();
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    while (spyList.length) spyList.pop()!.destroy();
    (window.open as ReturnType<typeof vi.spyOn>).mockRestore();
    document.body.replaceChildren();
  });

  it("routes external http links through the injected opener", () => {
    const { view } = buildView(spyOpen);
    spyList.push(view);
    clickAnchor(view, "https://example.com/page");
    expect(spyOpen).toHaveBeenCalledWith("https://example.com/page");
    expect(window.open).not.toHaveBeenCalled();
  });

  it("never calls window.open even without an opener injected", () => {
    const { view } = buildView();
    spyList.push(view);
    clickAnchor(view, "https://example.com/page");
    expect(window.open).not.toHaveBeenCalled();
  });

  it("does not intercept internal # anchor links", () => {
    const { view } = buildView(spyOpen);
    spyList.push(view);
    clickAnchor(view, "#heading");
    expect(spyOpen).not.toHaveBeenCalled();
  });
});