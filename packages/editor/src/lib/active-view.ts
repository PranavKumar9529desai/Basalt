/**
 * Locate the active markdown EditorView from the DOM — the cross-feature
 * seam for "insert text at the caret" (templates, tasks, DnD). Uses CM6's
 * own DOM registry so any feature can dispatch into the editor without
 * importing app code (ADR-018 shell/feature decoupling).
 */
import { EditorView } from "@codemirror/view";

/**
 * Active markdown view: the focused editor if any, else the first visible
 * one. Same DOM-level access pattern as the templates feature — keeps
 * callers self-contained (no cross-feature imports).
 */
export function findActiveMarkdownView(): EditorView | null {
  const focused = EditorView.findFromDOM(document.activeElement as HTMLElement);
  if (focused) return focused;
  const els = document.querySelectorAll<HTMLElement>(".cm-editor");
  for (const el of els) {
    const view = EditorView.findFromDOM(el);
    if (view) return view;
  }
  return null;
}
