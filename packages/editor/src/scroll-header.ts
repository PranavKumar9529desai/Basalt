import type { EditorView } from "@codemirror/view";

/**
 * Scroller-injected title slot (ADR-023): inserts a full-width block as the
 * FIRST child of `.cm-scroller` (before `.cm-content`), so it scrolls with
 * the document while CodeMirror stays the sole scroll owner — 5k-line
 * virtualization and the controller's scroll-top logic are untouched.
 *
 * The scroller is a flex container whose default axis is row; stacking the
 * title above the content requires column direction, enabled via the
 * `data-basalt-title` attribute on `.cm-editor` (see globals.css). The
 * layers CM positions absolutely (selection, cursor) are direction-agnostic.
 *
 * The caller mounts its own React root into `slot` and owns its lifecycle;
 * this helper owns only the DOM insertion/removal and the layout flag.
 */
export function attachScrollHeader(
  view: EditorView,
  slot: HTMLElement,
): () => void {
  slot.classList.add("cm-scroller-title");
  slot.setAttribute("data-basalt-title-slot", "true");
  view.scrollDOM.prepend(slot);

  const editorDom = view.dom;
  const hadTitle = editorDom.hasAttribute("data-basalt-title");
  editorDom.setAttribute("data-basalt-title", "true");

  return () => {
    if (slot.parentNode === view.scrollDOM) slot.remove();
    // Clear the layout flag if this slot was the only one.
    if (
      !hadTitle &&
      !view.scrollDOM.querySelector("[data-basalt-title-slot]")
    ) {
      editorDom.removeAttribute("data-basalt-title");
    }
  };
}
