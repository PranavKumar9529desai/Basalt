import { EditorView } from "@codemirror/view";
import { commandService } from "@workspace/commands";
import { useExportStore } from "./store";

function findActiveMarkdownView(): EditorView | null {
  const els = document.querySelectorAll<HTMLElement>(".cm-editor");
  for (const el of els) {
    const view = EditorView.findFromDOM(el);
    if (view) return view;
  }
  return null;
}

/** The active markdown document (current, possibly unsaved, CM state). */
function getActiveMarkdownContent(): string | null {
  const view = findActiveMarkdownView();
  return view ? view.state.doc.toString() : null;
}

/** Derive the note name from the first H1 (matching the inline-title model). */
function getActiveNoteName(): string {
  const view = findActiveMarkdownView();
  if (!view || view.state.doc.lines === 0) return "Untitled";
  const firstLine = view.state.doc.line(1).text;
  const heading = firstLine.match(/^#\s+(.+)/);
  return heading?.[1] ?? "Untitled";
}

commandService.registerCommand("export:note", () => {
  const content = getActiveMarkdownContent();
  if (!content) return;
  const name = getActiveNoteName();
  useExportStore.getState().open(content, name);
});
