/**
 * Reading-mode link handling (ADR-029). External http(s) links must route
 * through the injected `openExternalLinkFacet` (Tauri system browser) — never
 * `window.open`, which behaves wrongly inside a WebView. Internal/anchor links
 * and wikilinks keep their existing paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { readingExtensions } from "../../src/editor";
import {
  targetFromWikiLinkNode,
  wikiLinkExtension,
} from "../../src/syntax/wiki-links";

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

/** Build a reading-mode view with custom doc + link handlers. */
function buildHandlerView(
  doc: string,
  handlers: { onOpenLink?: (link: string) => void },
) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        readingExtensions({
          onOpenLink: handlers.onOpenLink,
        }),
      ],
    }),
    parent,
  });
  return { view, parent };
}

/** Append `el` to a live view and dispatch a click through the handler. */
function clickOn(view: EditorView, el: HTMLElement) {
  view.contentDOM.appendChild(el);
  el.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }),
  );
  el.remove();
}

describe("wikilink target slicing (ADR-034 part D)", () => {
  /** Parse `doc` and return its first WikiLink node (or top node when none). */
  function wikiContext(doc: string) {
    const state = EditorState.create({
      doc,
      extensions: [
        markdown({ base: markdownLanguage, extensions: [wikiLinkExtension] }),
      ],
    });
    const tree = syntaxTree(state);
    let node: SyntaxNode | null = null;
    tree.iterate({
      enter(n) {
        if (n.name === "WikiLink") {
          node = n.node;
          return false;
        }
      },
    });
    return { state, node: node ?? tree.topNode };
  }

  it("slices [[ ]] off via syntax offsets and strips alias/section", () => {
    const plain = wikiContext("[[Rust]]");
    expect(targetFromWikiLinkNode(plain.state, plain.node)).toBe("Rust");
    const aliased = wikiContext("[[My Note|Alias]]");
    expect(targetFromWikiLinkNode(aliased.state, aliased.node)).toBe("My Note");
    const sectioned = wikiContext("[[My Note#Intro]]");
    expect(targetFromWikiLinkNode(sectioned.state, sectioned.node)).toBe(
      "My Note",
    );
  });

  it("returns null for non-wikilink nodes", () => {
    const ctx = wikiContext("plain text");
    expect(targetFromWikiLinkNode(ctx.state, ctx.node)).toBeNull();
  });
});

describe("reading-mode link clicks (ADR-034 part D)", () => {
  it("navigates a wikilink with the [[ ]] brackets sliced off", () => {
    const onOpenLink = vi.fn<(link: string) => void>();
    const { view, parent } = buildHandlerView("body", { onOpenLink });
    try {
      const span = document.createElement("span");
      span.className = "cm-live-wikilink";
      span.textContent = "[[Rust]]";
      clickOn(view, span);
      expect(onOpenLink).toHaveBeenCalledWith("Rust");
      expect(onOpenLink.mock.calls[0][0]).not.toContain("[");
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it("navigates a table link via its data-name", () => {
    const onOpenLink = vi.fn<(link: string) => void>();
    const { view, parent } = buildHandlerView("", { onOpenLink });
    try {
      const span = document.createElement("span");
      span.className = "cm-table-link";
      span.setAttribute("data-name", "Photos");
      span.textContent = "Photos";
      clickOn(view, span);
      expect(onOpenLink).toHaveBeenCalledWith("Photos");
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it("does not navigate video/audio media elements (playback owns the click)", () => {
    const onOpenLink = vi.fn<(link: string) => void>();
    const { view, parent } = buildHandlerView("", { onOpenLink });
    try {
      const video = document.createElement("video");
      video.className = "cm-table-link cm-table-media";
      video.setAttribute("data-name", "clip.mp4");
      clickOn(view, video);
      expect(onOpenLink).not.toHaveBeenCalled();
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it("navigates a table media image (no playback semantics)", () => {
    const onOpenLink = vi.fn<(link: string) => void>();
    const { view, parent } = buildHandlerView("", { onOpenLink });
    try {
      const img = document.createElement("img");
      img.className = "cm-table-link cm-table-media";
      img.setAttribute("data-name", "photo.png");
      clickOn(view, img);
      expect(onOpenLink).toHaveBeenCalledWith("photo.png");
    } finally {
      view.destroy();
      parent.remove();
    }
  });
});
