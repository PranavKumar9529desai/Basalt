import { WidgetType, type EditorView } from "@codemirror/view";
import type {
  FrontmatterEditFn,
  FrontmatterEntry,
  FrontmatterFetch,
  FrontmatterModel,
  FrontmatterValue,
} from "./types";

/** Human-readable form of a value for input fields. */
export function displayValue(v: FrontmatterValue): string {
  if (typeof v === "string") return ""; // "None"
  if ("Text" in v) return v.Text;
  if ("Link" in v) return `[[${v.Link}]]`;
  if ("Number" in v) return String(v.Number);
  if ("Checkbox" in v) return v.Checkbox ? "true" : "false";
  if ("Date" in v) return v.Date;
  if ("DateTime" in v) return v.DateTime;
  if ("List" in v) return v.List.map(displayValue).join(", ");
  return "";
}

/** Infer a value type from free text (used when adding a new property). */
function inferValue(text: string): FrontmatterValue {
  const t = text.trim();
  if (t === "") return "None";
  if (/^-?\d+(\.\d+)?$/.test(t)) return { Number: Number(t) };
  if (t === "true" || t === "false") return { Checkbox: t === "true" };
  const link = t.match(/^\[\[(.+)\]\]$/);
  if (link) return { Link: link[1] };
  return { Text: t };
}

/**
 * Coerce edited text back into the property's existing type so a Date/Number/
 * Link field keeps its type across edits (only new properties infer a type).
 */
function coerce(text: string, original?: FrontmatterValue): FrontmatterValue {
  const t = text.trim();
  if (original && typeof original !== "string") {
    if ("Number" in original) {
      const n = Number(t);
      return Number.isNaN(n) ? { Text: t } : { Number: n };
    }
    if ("Checkbox" in original) return { Checkbox: t === "true" || t === "yes" || t === "1" };
    if ("Date" in original) return { Date: t };
    if ("DateTime" in original) return { DateTime: t };
    if ("Link" in original) return { Link: t.replace(/^\[\[|\]\]$/g, "") };
    if ("Text" in original) return { Text: t };
  }
  return inferValue(t);
}

/**
 * Inline Live-Preview "Properties" box. Replaces the YAML frontmatter block in
 * the editor canvas (a CodeMirror replacement decoration) without altering the
 * document — surgical span edits stay valid (ADR-022 rule 4). Edits dispatch
 * through the injected `edit` callback; the model re-parses and the widget
 * re-renders.
 */
export class FrontmatterWidget extends WidgetType {
  private view: EditorView | undefined;

  constructor(
    readonly model: FrontmatterModel,
    readonly edit: FrontmatterEditFn,
    readonly fetch: FrontmatterFetch = {},
  ) {
    super();
  }

  /** Dispatch a frontmatter edit through the view captured at toDOM. No-ops
   * safely if toDOM hasn't run (defensive; the widget is only visible once a
   * view exists). */
  private editWith(key: string, value?: FrontmatterValue, newKey?: string): void {
    const v = this.view;
    if (!v) return;
    this.edit(v, key, value, newKey);
  }

  /** Reuse the DOM only when the rendered model is identical, so unrelated
   * async refreshes don't blow away focus mid-edit. */
  eq(other: FrontmatterWidget): boolean {
    return JSON.stringify(this.model) === JSON.stringify(other.model);
  }

  /** Let the browser handle all events over the widget (typing, clicks). */
  ignoreEvent(): boolean {
    return true;
  }

  toDOM(_view: EditorView): HTMLElement {
    // The edit callback is view-bound here — never a module-global "active
    // editor" (ADR-022 rule 10): widget DOM events happen outside CM's update
    // cycle, so dispatching through the owning view is safe and per-pane.
    this.view = _view;
    const root = document.createElement("div");
    root.className = "cm-frontmatter-properties";

    const header = document.createElement("div");
    header.className = "cm-frontmatter-properties-header";
    header.textContent = "Properties";
    root.appendChild(header);

    const rows = document.createElement("div");
    rows.className = "cm-frontmatter-properties-rows";
    for (const entry of this.model.entries) {
      rows.appendChild(this.renderEntry(entry));
    }
    root.appendChild(rows);
    root.appendChild(this.renderAddRow());
    return root;
  }

  private diagnosticFor(entry: FrontmatterEntry): string | null {
    for (const d of this.model.diagnostics) {
      const lo = entry.keySpan.start;
      const hi = entry.valueSpan.end;
      if (d.span.start >= lo && d.span.end <= hi) return d.message;
    }
    return null;
  }

  private renderEntry(entry: FrontmatterEntry): HTMLElement {
    const row = document.createElement("div");
    row.className = "cm-fm-row";

    const err = this.diagnosticFor(entry);
    if (err) {
      row.classList.add("cm-fm-error");
      row.title = err;
    }

    const keyInput = document.createElement("input");
    keyInput.className = "cm-fm-key";
    keyInput.value = entry.key;
    const commitKey = () => {
      const nk = keyInput.value.trim();
      if (nk && nk !== entry.key) this.editWith(entry.key, entry.value, nk);
    };
    keyInput.addEventListener("blur", commitKey);
    keyInput.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") keyInput.blur();
    });

    const valueEl = this.renderValue(entry);

    const remove = document.createElement("button");
    remove.className = "cm-fm-remove";
    remove.type = "button";
    remove.textContent = "✕";
    remove.title = "Remove property";
    remove.addEventListener("click", () => this.editWith(entry.key, undefined));

    row.append(keyInput, valueEl, remove);
    return row;
  }

  private renderValue(entry: FrontmatterEntry): HTMLElement {
    const v = entry.value;
    if (typeof v !== "string") {
      if ("Checkbox" in v) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "cm-fm-value cm-fm-checkbox";
        cb.checked = v.Checkbox;
        cb.addEventListener("change", () =>
          this.editWith(entry.key, { Checkbox: cb.checked }),
        );
        return cb;
      }
      if ("List" in v) {
        return this.renderList(entry.key, v.List);
      }
    }
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cm-fm-value";
    input.value = displayValue(v);
    const commit = () => this.editWith(entry.key, coerce(input.value, entry.value));
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") input.blur();
    });
    return input;
  }

  private renderList(key: string, items: FrontmatterValue[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-fm-list";

    for (const item of items) {
      const chip = document.createElement("span");
      chip.className = "cm-fm-chip";
      chip.textContent = displayValue(item);
      const x = document.createElement("button");
      x.className = "cm-fm-chip-x";
      x.type = "button";
      x.textContent = "✕";
      x.addEventListener("click", () => {
        const next = items.filter((it) => it !== item);
        this.editWith(key, { List: next });
      });
      chip.appendChild(x);
      wrap.appendChild(chip);
    }

    const add = document.createElement("input");
    add.type = "text";
    add.className = "cm-fm-value cm-fm-list-add";
    add.placeholder = "add…";

    // Vault autocomplete for Obsidian's tag/alias fields.
    if (key === "tags" || key === "aliases") {
      const dl = document.createElement("datalist");
      const dlId = `cm-fm-dl-${key}`;
      dl.id = dlId;
      add.setAttribute("list", dlId);
      const populate = async () => {
        const tags = key === "tags" ? await this.fetch.onFetchTags?.(add.value) : undefined;
        const links = key === "aliases" ? await this.fetch.onFetchLinks?.(add.value) : undefined;
        const opts: string[] = key === "tags" ? (tags ?? []) : (links ?? []).map((l) => l.name);
        const present = new Set(items.map(displayValue));
        dl.replaceChildren(
          ...opts.filter((o) => !present.has(o)).map((o) => {
            const op = document.createElement("option");
            op.value = o;
            return op;
          }),
        );
      };
      add.addEventListener("focus", populate);
      add.addEventListener("input", populate);
      wrap.appendChild(dl);
    }

    add.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") {
        const val = add.value.trim();
        if (val) {
          this.editWith(key, { List: [...items, inferValue(val)] });
          add.value = "";
        }
      }
    });
    wrap.appendChild(add);
    return wrap;
  }

  private renderAddRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "cm-fm-row cm-fm-add";

    const keyInput = document.createElement("input");
    keyInput.className = "cm-fm-key";
    keyInput.placeholder = "new property";

    const valInput = document.createElement("input");
    valInput.className = "cm-fm-value";
    valInput.placeholder = "value";

    const add = () => {
      const k = keyInput.value.trim();
      const raw = valInput.value;
      if (k) {
        this.editWith(k, raw.trim() === "" ? "None" : inferValue(raw));
        keyInput.value = "";
        valInput.value = "";
      }
    };
    keyInput.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") valInput.focus();
    });
    valInput.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") add();
    });

    row.append(keyInput, valInput);
    return row;
  }
}
