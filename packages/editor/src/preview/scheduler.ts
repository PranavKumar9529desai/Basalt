/**
 * Live Preview — deferred convergence / rebuild scheduling (ADR-038 split of
 * live-preview.ts).
 *
 * The idle `PreviewScheduler` defers full structure rebuilds on large
 * documents: typing on big notes maps decorations lazily in the field (see
 * `livePreviewField`), and this plugin dispatches `rebuildPreview` when the
 * main thread goes idle so the structure catches up between keystrokes. Also
 * covers mount-time parse growth on huge files. See live-preview.ts for the
 * pipeline invariants (ADR-019).
 */

import { StateEffect, type StateField } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { editorBenchmarkState } from "../perf/benchmark";
import { LAZY_DOC_THRESHOLD, type PreviewState } from "./collector";

/** Force a synchronous full rebuild from the current state. */
export const rebuildPreview = StateEffect.define<null>();

/** Base idle timeout before a deferred rebuild is forced regardless. */
const IDLE_REBUILD_TIMEOUT_MS = 350;

/**
 * Idle scheduler — defers full structure rebuilds on large documents.
 * Typing on big notes maps decorations lazily (see `livePreviewField`); this
 * plugin dispatches `rebuildPreview` when the main thread goes idle so the
 * structure catches up between keystrokes. Also covers mount-time parse
 * growth on huge files. Never schedules while a benchmark is running —
 * measurements must see the pure keystroke path.
 */
class PreviewScheduler {
  private scheduled = false;
  private readonly field: StateField<PreviewState>;

  constructor(_view: EditorView, field: StateField<PreviewState>) {
    this.field = field;
    // Mount-time catch-up: covers budgeted-parse growth on huge notes that
    // would otherwise stay undecorated until the first interaction.
    this.schedule(_view);
  }

  update(update: {
    docChanged: boolean;
    selectionSet: boolean;
    view: EditorView;
  }) {
    const field = update.view.state.field(this.field, false);
    // Docs at or below LAZY_DOC_THRESHOLD rebuilt synchronously in the field
    // during this same transaction — an idle rebuild would be pure waste.
    const isLazyDoc =
      update.view.state.doc.length > LAZY_DOC_THRESHOLD ||
      (field !== undefined && !field.complete);
    if (
      (update.docChanged || update.selectionSet) &&
      isLazyDoc &&
      !this.scheduled &&
      !editorBenchmarkState.active
    ) {
      this.schedule(update.view);
    }
  }

  private schedule(view: EditorView) {
    if (editorBenchmarkState.active) return;
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      if (editorBenchmarkState.active) return;
      view.dispatch({ effects: rebuildPreview.of(null) });
      // A huge doc may take several budgeted passes to reach full coverage
      // (each capped at ~1 frame — see `buildPreviewState`). Keep re-arming
      // the idle loop until the forced rebuild completes; otherwise the doc
      // would stay undecorated until the next interaction. Bounded: the parse
      // is monotonic, so the loop terminates once the tree covers the doc.
      const field = view.state.field(this.field, false);
      if (
        field !== undefined &&
        !field.complete &&
        !editorBenchmarkState.active
      ) {
        this.schedule(view);
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: IDLE_REBUILD_TIMEOUT_MS });
    } else {
      setTimeout(run, 32);
    }
  }
}

export const previewScheduler = (field: StateField<PreviewState>) =>
  ViewPlugin.fromClass(
    class extends PreviewScheduler {
      constructor(view: EditorView) {
        super(view, field);
      }
    },
  );
