/**
 * Live-preview orchestration — the incremental/lazy machinery around the
 * single decoration field (ADR-019, ADR-029), exercised through a real
 * EditorView (the fixture builders don't drive update paths):
 *
 * 1. Docs under the 48KB lazy threshold always full-rebuild synchronously —
 *    per keystroke (with selection) and even on programmatic no-selection
 *    changes.
 * 2. Docs above the threshold take the lazy mapping path for no-selection
 *    changes (widget models preserved by reference; nothing re-walked) and full
 *    rebuild when the transaction carries a selection.
 * 3. The idle `PreviewScheduler` converges huge docs toward complete coverage
 *    (jsdom lacks requestIdleCallback, so the scheduler's setTimeout fallback
 *    is what this drives).
 *
 * The distinguishing probe is `widgetModels` reference identity: the lazy path
 * returns `value.widgetModels` untouched, every full rebuild allocates a fresh
 * object. A table block widget at the doc end populates a model on rebuild.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, EditorSelection, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basaltMarkdownExtensions } from "../_helpers/parse-markdown";
import {
  livePreviewField,
  livePreviewPlugin,
  requestPreviewRebuild,
} from "../../src/preview/live-preview";
import { TABLE_BLOCK_THEME, tableBlockSpec } from "../../src/block-widgets/table-widget";
import { blockWidgetSpecsFacet } from "../../src/block-widgets/registry";

const TABLE = "\n| A | B |\n|---|---|\n| 1 | 2 |";

function bigDoc(kb: number): string {
  const h = "# H1\n## H2\n### H3\n";
  const body =
    "lorem ipsum paragraph with **bold** [[wikilink]] and `code` words\n";
  let s = "";
  while (s.length < kb * 1024) s += h + body;
  return s.slice(0, kb * 1024) + TABLE;
}

function extensionsFor(): Extension[] {
  return [
    markdown({ base: markdownLanguage, extensions: basaltMarkdownExtensions }),
    ...livePreviewPlugin,
    blockWidgetSpecsFacet.of(tableBlockSpec),
    TABLE_BLOCK_THEME,
  ];
}

const settle = () => new Promise((r) => setTimeout(r, 80));

/** The budgeted parse takes several idle passes to cover a huge doc. Meet the
 * deferred rebuilds deterministically instead of betting on wall-clock timing:
 * poll until the field reports a complete parse (a generous cap for slow CI). */
async function untilComplete(view: EditorView, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (
    !view.state.field(livePreviewField, false)?.complete &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(view.state.field(livePreviewField).complete).toBe(true);
}

/** Wait until a *complete* full rebuild has run (fresh widgetModels with the
 * table model back). Used to catch the scheduler's deferred rebuild, which
 * `untilComplete` can't see — the lazy path preserves `complete: true`, so
 * completeness polling returns immediately; and an intermediate budgeted
 * rebuild can return an *empty* model set, so a reference change alone isn't
 * proof the field settled. */
async function untilRebuilt(
  view: EditorView,
  previous: object,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const f = view.state.field(livePreviewField);
    if (
      f.complete &&
      f.widgetModels !== previous &&
      f.widgetModels["table-block"]?.length === 1
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out waiting for a settled full rebuild");
}

describe("live-preview field update paths", () => {
  const views: EditorView[] = [];

  beforeEach(() => {
    views.length = 0;
  });

  afterEach(async () => {
    // Let any scheduled idle rebuild fire while views are alive; then destroy.
    await settle();
    while (views.length) views.pop()!.destroy();
    document.body.replaceChildren();
  });

  function mount(doc: string): EditorView {
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(0),
        extensions: extensionsFor(),
      }),
      parent: document.body,
    });
    views.push(view);
    return view;
  }

  it("rebuilds synchronously on a small doc, even for no-selection changes", () => {
    const view = mount(`# Small\n${TABLE}`);
    requestPreviewRebuild(view); // converge (force)
    const f0 = view.state.field(livePreviewField);
    expect(f0.complete).toBe(true);
    expect(f0.widgetModels["table-block"]?.length).toBe(1);

    // No explicit selection in the transaction, but the doc is tiny.
    view.dispatch({
      changes: { from: 1, insert: "X" },
      userEvent: "input.type",
    });
    const f1 = view.state.field(livePreviewField);
    // Full rebuild ran inside the transaction → fresh widgetModels.
    expect(f1.widgetModels).not.toBe(f0.widgetModels);
    expect(f1.complete).toBe(true);
  });

  it("keeps huge-doc no-selection changes on the lazy map path", async () => {
    const view = mount(bigDoc(72));
    await untilComplete(view); // budgeted passes + idle convergence
    const f0 = view.state.field(livePreviewField);
    expect(f0.widgetModels["table-block"]?.length).toBe(1);
    const wm0 = f0.widgetModels;

    // Programmatic change without a selection → decorations mapped, no walk.
    view.dispatch({
      changes: { from: 0, insert: "prefix " },
      userEvent: "input.type",
    });
    const f1 = view.state.field(livePreviewField);
    expect(f1.complete).toBe(true);
    // widgetModels kept by reference → lazy path taken.
    expect(f1.widgetModels).toBe(wm0);
  });

  it("full-rebuilds a huge doc when the transaction carries a selection", async () => {
    const view = mount(bigDoc(72));
    await untilComplete(view); // converge before capturing the reference
    const wm0 = view.state.field(livePreviewField).widgetModels;

    // Keystroke-shaped transaction: change + explicit selection.
    view.dispatch({
      changes: { from: 0, insert: "p" },
      selection: EditorSelection.cursor(1),
      userEvent: "input.type",
    });
    // A full rebuild ran (fresh models object) even before idle catch-up.
    expect(view.state.field(livePreviewField).widgetModels).not.toBe(wm0);
    await untilComplete(view); // converges the post-edit re-parse
  });

  it("idle scheduler pokes a forced rebuild after a lazy no-selection change", async () => {
    const view = mount(bigDoc(72));
    await untilComplete(view);
    const wm0 = view.state.field(livePreviewField).widgetModels;

    view.dispatch({ changes: { from: 0, insert: "x" } });
    // Lazy path — models still the converged ones right after the dispatch.
    const wm1 = view.state.field(livePreviewField).widgetModels;
    expect(wm1).toBe(wm0);

    // The scheduler re-dispatches a forced rebuild asynchronously (setTimeout
    // fallback in jsdom) → the models get replaced without any further
    // transaction from the test.
    await untilRebuilt(view, wm0);
    // The table at the doc end survived the rebuild.
    expect(view.state.field(livePreviewField).widgetModels["table-block"]?.length).toBe(1);
  });
});