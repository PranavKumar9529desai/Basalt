import type { EditorView } from "@codemirror/view";
import {
  type FrontmatterModel,
  type FrontmatterValue,
  type ParseFrontmatterFn,
  getBlockWidgetModel,
} from "@workspace/editor";
import { parseFrontmatterSync } from "./frontmatter-wasm";

// Re-export the loader so MarkdownEditorView can await wasm before
// building EditorStates.
export { initFrontmatterWasm } from "./frontmatter-wasm";

/**
 * Injected synchronous parser for `packages/editor` (ADR-022 rule 2): the
 * Rust/WASM engine, called inside the decoration state field — never a JS
 * YAML re-implementation (ADR-007). All editor state now flows through the
 * per-view model (ADR-022 rule 10); there is no module-global cache or
 * mirror store on the feature side anymore.
 */
export const parseFrontmatter: ParseFrontmatterFn = (text) =>
  parseFrontmatterSync(text);

export function serializeFrontmatterValue(value: FrontmatterValue): string {
  if (typeof value === "string") return '""';
  if ("Text" in value) return JSON.stringify(value.Text);
  if ("List" in value) {
    return `[${value.List.map(serializeFrontmatterValue).join(", ")}]`;
  }
  if ("Number" in value) return String(value.Number);
  if ("Checkbox" in value) return value.Checkbox ? "true" : "false";
  if ("Date" in value) return value.Date;
  if ("DateTime" in value) return value.DateTime;
  if ("Link" in value) return JSON.stringify(`[[${value.Link}]]`);
  return '""';
}

/**
 * Surgically edit a frontmatter property in place (ADR-022 rule 4): replace
 * only the value span, or insert a new line before the closing fence. Never
 * re-serializes the whole block, so formatting/CRLF elsewhere are preserved.
 * The model comes from the (per-view) model the editor keeps fresh on the
 * same transaction — no global "active view" indirection.
 */
export function surgicalEdit(
  view: EditorView,
  key: string,
  value?: FrontmatterValue,
  newKey?: string,
): void {
  const model = getBlockWidgetModel<FrontmatterModel>(view, "frontmatter");
  if (!model) return;
  const entry = model.entries.find((e) => e.key === key);

  if (value === undefined) {
    if (!entry) return;
    const doc = view.state.doc;
    const from = doc.lineAt(entry.keySpan.start).from;
    const to = doc.lineAt(entry.valueSpan.end).to + 1; // include trailing newline
    view.dispatch({ changes: { from, to } });
    return;
  }

  const serialized = serializeFrontmatterValue(value);
  if (entry) {
    const changes: { from: number; to: number; insert: string }[] = [];
    if (newKey && newKey !== entry.key) {
      // Rename: replace the key span (the key text only, not the colon).
      changes.push({ from: entry.keySpan.start, to: entry.keySpan.end, insert: newKey });
    }
    changes.push({ from: entry.valueSpan.start, to: entry.valueSpan.end, insert: serialized });
    view.dispatch({ changes });
    return;
  }

  if (!model.blockSpan) {
    // No block yet — create one so the properties panel can add from scratch.
    view.dispatch({
      changes: { from: 0, insert: `---\n${newKey ?? key}: ${serialized}\n---\n\n` },
    });
    return;
  }
  view.dispatch({
    changes: { from: model.blockSpan.end, insert: `${newKey ?? key}: ${serialized}\n` },
  });
}

/** Edit a property on the given editor view (injected into `packages/editor`
 * as `EditorConfig.editFrontmatter`). `value` undefined removes the property;
 * `newKey` renames an existing key. The editor model re-parses synchronously
 * in the same transaction, so the panel/inline widget re-render with the new
 * value — no raw-YAML flash (ADR-022 rule 2). */
export function editFrontmatter(
  view: EditorView,
  key: string,
  value?: FrontmatterValue,
  newKey?: string,
): void {
  surgicalEdit(view, key, value, newKey);
}