import { invoke } from "@tauri-apps/api/core";
import type { EditorView } from "@codemirror/view";
import {
  type FrontmatterModel,
  type FrontmatterValue,
  type ParseFrontmatterFn,
  getFrontmatterModel,
  requestFrontmatterReparse,
} from "@workspace/editor";
import { create } from "zustand";

type TimerHandle = number;

// Synchronous cache keyed by document text. The editor model plugin calls
// `parseFrontmatter` synchronously on every frontmatter-region transaction;
// we return the most recently computed model for that text (updated
// asynchronously via `refreshFrontmatter`). ADR-022 rule 2: parser is
// Rust-owned and injected — never a second JS YAML parser (ADR-007).
const cache: Record<string, FrontmatterModel> = {};

export const parseFrontmatter: ParseFrontmatterFn = (text) => cache[text] ?? null;

interface FrontmatterState {
  model: FrontmatterModel | null;
  setModel: (model: FrontmatterModel | null) => void;
}

export const useFrontmatter = create<FrontmatterState>((set) => ({
  model: null,
  setModel: (model) => set({ model }),
}));

let refreshTimer: TimerHandle | undefined;

/** Async-refresh the cached model for `text` and push it into the editor. */
export function refreshFrontmatter(
  view: EditorView,
  text: string,
  debounceMs = 120,
): void {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void invoke<FrontmatterModel>("parse_frontmatter", { text })
      .then((model) => {
        cache[text] = model;
        useFrontmatter.getState().setModel(model);
        requestFrontmatterReparse(view);
      })
      .catch((err) =>
        console.error("[frontmatter] parse_frontmatter failed:", err),
      );
  }, debounceMs);
}

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

let activeView: EditorView | null = null;

/** Track the active editor so the properties panel can drive edits. */
export function setActiveFrontmatterEditor(view: EditorView | null): void {
  activeView = view;
}

/**
 * Surgically edit a frontmatter property in place (ADR-022 rule 4): replace
 * only the value span, or insert a new line before the closing fence. Never
 * re-serializes the whole block, so formatting/CRLF elsewhere are preserved.
 */
export function surgicalEdit(
  view: EditorView,
  key: string,
  value?: FrontmatterValue,
): void {
  const model = getFrontmatterModel(view);
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
    view.dispatch({
      changes: {
        from: entry.valueSpan.start,
        to: entry.valueSpan.end,
        insert: serialized,
      },
    });
    return;
  }

  if (!model.blockSpan) {
    // No block yet — create one so the properties panel can add from scratch.
    view.dispatch({
      changes: { from: 0, insert: `---\n${key}: ${serialized}\n---\n\n` },
    });
    return;
  }
  view.dispatch({
    changes: { from: model.blockSpan.end, insert: `${key}: ${serialized}\n` },
  });
}

/** Edit a property on the active editor (used by the properties panel). */
export function editFrontmatter(key: string, value?: FrontmatterValue): void {
  if (activeView) surgicalEdit(activeView, key, value);
}
