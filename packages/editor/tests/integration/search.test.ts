/**
 * Find & Replace integration (Phase 3 Tier-1 feature). The @codemirror/search
 * extension is part of the base group, so the full production extension stack
 * must support: opening the panel via `openSearchPanel`, cycling matches,
 * replacing through the panel, and closing via Escape.
 */
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  closeSearchPanel,
  findNext,
  openSearchPanel,
  replaceAll,
  setSearchQuery,
} from "@codemirror/search";
import { SearchQuery } from "@codemirror/search";
import { createEditorExtensions } from "../../src/editor";

function buildView(doc: string): { view: EditorView; parent: HTMLDivElement } {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: createEditorExtensions({}),
    }),
    parent,
  });
  return { view, parent };
}

describe("find & replace in the production extension stack", () => {
  const views: EditorView[] = [];

  afterEach(() => {
    for (const v of views.splice(0)) v.destroy();
    document.body.innerHTML = "";
  });

  it("opens the search panel and highlights matches", () => {
    const { view } = buildView("alpha beta alpha");
    views.push(view);

    expect(view.dom.querySelector(".cm-search")).toBeNull();
    openSearchPanel(view);

    const panel = view.dom.querySelector(".cm-search");
    expect(panel).not.toBeNull();
    // Default query prefills from the current selection (empty → empty),
    // then a typed query re-runs matches. Set the query directly:
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({ search: "alpha", caseSensitive: false }),
      ),
    });

    // Matches are decorated with the .cm-searchMatch class.
    expect(view.dom.querySelectorAll(".cm-searchMatch").length).toBeGreaterThan(
      0,
    );

    // findNext advances the selection onto a match.
    findNext(view);
    const sel = view.state.selection.main;
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe("alpha");
  });

  it("replaces all matches through the panel commands", () => {
    const { view } = buildView("alpha beta alpha\nfrontmatter alpha");
    views.push(view);

    openSearchPanel(view);
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({ search: "alpha", replace: "omega" }),
      ),
    });
    expect(replaceAll(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "omega beta omega\nfrontmatter omega",
    );
  });

  it("closes the panel on closeSearchPanel", () => {
    const { view } = buildView("alpha");
    views.push(view);

    openSearchPanel(view);
    expect(view.dom.querySelector(".cm-search")).not.toBeNull();
    closeSearchPanel(view);
    expect(view.dom.querySelector(".cm-search")).toBeNull();
  });

  it("reading mode still exposes find (read-only panel renders search only)", () => {
    // Search extension is in base (shared, outside the mode compartment) —
    // reading mode keeps the panel usable.
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: "# Title\ncontent",
        extensions: [
          ...createEditorExtensions({}),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
        ],
      }),
      parent,
    });
    views.push(view);

    openSearchPanel(view);
    expect(view.dom.querySelector(".cm-search")).not.toBeNull();
    // Read-only state shows no replace field.
    expect(
      view.dom.querySelector('.cm-search input[name="replace"]'),
    ).toBeNull();
  });
});
