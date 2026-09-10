import type { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorBenchmarkState } from "@workspace/editor";
import type { LeafTabInfo } from "@workspace/views";

/**
 * Subscribes the controller to CM document-update events and funnels them to
 * the controller's per-tab edit handling. Pure wiring: benchmark dispatches
 * and non-document updates are filtered here, and every surviving edit
 * reaches `onEdit(tabId, state)` exactly once.
 */
export function createDocChangedListener(config: {
  getCurrentTab: () => LeafTabInfo | null;
  onEdit: (tabId: string, state: EditorState) => void;
}): Extension {
  return EditorView.updateListener.of((u) => {
    if (!u.docChanged) return;
    // Benchmark dispatches must not mark tabs dirty, schedule saves, or
    // pollute stats — the benchmark restores the doc itself.
    if (editorBenchmarkState.active) return;
    const t = config.getCurrentTab();
    if (!t) return;
    config.onEdit(t.id, u.state);
  });
}
