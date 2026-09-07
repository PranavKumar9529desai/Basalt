import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { commandService } from "@workspace/commands";

import { expandTemplate } from "./lib/expand-template";
import { splitTemplateFrontmatter } from "./lib/split-frontmatter";
import { useTemplatePickerStore } from "./picker-store";

/**
 * Active markdown view: the focused editor if any, else the first visible
 * one. Same DOM-level access as `features/export/commands.ts` — keeps this
 * feature self-contained (no cross-feature imports).
 */
function findActiveMarkdownView(): EditorView | null {
  const focused = EditorView.findFromDOM(document.activeElement as HTMLElement);
  if (focused) return focused;
  const els = document.querySelectorAll<HTMLElement>(".cm-editor");
  for (const el of els) {
    const view = EditorView.findFromDOM(el);
    if (view) return view;
  }
  return null;
}

/** Derive the note title from the first H1 (matching the inline-title model). */
function getActiveNoteTitle(): string {
  const view = findActiveMarkdownView();
  if (!view || view.state.doc.lines === 0) return "Untitled";
  const firstLine = view.state.doc.line(1).text;
  const heading = firstLine.match(/^#\s+(.+)/);
  return heading?.[1] ?? "Untitled";
}

/**
 * Read a template and insert its expanded content into the active editor.
 * `{{title}}` resolves from the active note's first H1.
 *
 * A template's leading frontmatter block is hoisted to the very top of the
 * note so it always renders as the Properties widget — YAML frontmatter is
 * only recognized at byte-0 (ADR-022). If the note already has frontmatter,
 * the template's block is skipped (the note's own properties win) and only
 * the body is inserted at the cursor.
 */
export async function insertTemplate(name: string): Promise<void> {
  const view = findActiveMarkdownView();
  if (!view) return; // nothing to insert into — command stays silent

  const raw = await invoke<string>("read_template", { name });
  const expanded = expandTemplate(raw, { title: getActiveNoteTitle(), now: new Date() });
  const { frontmatter, body } = splitTemplateFrontmatter(expanded);

  const doc = view.state.doc;
  const pos = view.state.selection.main.head;
  const hasExistingFrontmatter = doc.line(1).text.trim() === "---";

  if (frontmatter && !hasExistingFrontmatter && pos > 0) {
    // Hoist properties to the top; put the body at the cursor. Two dispatches
    // keep the ranges disjoint for any cursor position (a single dispatch
    // requires non-overlapping original-doc ranges).
    const block = frontmatter + "\n\n";
    view.dispatch({ changes: { from: 0, insert: block } });
    const bodyPos = pos + block.length; // cursor shifted by the hoisted block
    view.dispatch({
      changes: { from: bodyPos, insert: body },
      selection: { anchor: bodyPos + body.length },
    });
  } else if (frontmatter && hasExistingFrontmatter) {
    // Note already has properties — keep them, insert only the body.
    view.dispatch({
      changes: { from: pos, insert: body },
      selection: { anchor: pos + body.length },
    });
  } else {
    // No frontmatter to hoist (or empty note at the top) — insert as-is.
    view.dispatch({
      changes: { from: pos, insert: expanded },
      selection: { anchor: pos + expanded.length },
    });
  }
}

commandService.registerCommand("templates:insert", () => {
  useTemplatePickerStore.getState().open();
});