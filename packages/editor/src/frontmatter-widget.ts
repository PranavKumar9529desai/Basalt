import { WidgetType, type EditorView } from "@codemirror/view";
import type {
  FrontmatterEditFn,
  FrontmatterEntry,
  FrontmatterFetch,
  FrontmatterModel,
  FrontmatterValue,
} from "./types";
import { createFrontmatterIcon } from "./frontmatter-icons";
import {
  frontmatterValuesEqual,
  getVariantKey,
  isFrontmatterObject,
  type FrontmatterVariant,
} from "./frontmatter-utils";

function variantValue<T>(v: FrontmatterValue, name: string): T | undefined {
  if (!isFrontmatterObject(v)) return undefined;
  const key = getVariantKey(v, name);
  if (!key) return undefined;
  return v[key as keyof FrontmatterVariant] as T;
}

/** Human-readable form of a value for input fields. */
export function displayValue(v: FrontmatterValue): string {
  if (typeof v === "string") return ""; // "None"
  const text = variantValue<string>(v, "Text");
  if (text !== undefined) return text;
  const link = variantValue<string>(v, "Link");
  if (link !== undefined) return `[[${link}]]`;
  const number = variantValue<number>(v, "Number");
  if (number !== undefined) return String(number);
  const checkbox = variantValue<boolean>(v, "Checkbox");
  if (checkbox !== undefined) return checkbox ? "true" : "false";
  const date = variantValue<string>(v, "Date");
  if (date !== undefined) return date;
  const dateTime = variantValue<string>(v, "DateTime");
  if (dateTime !== undefined) return dateTime;
  const list = variantValue<FrontmatterValue[]>(v, "List");
  if (list !== undefined) return list.map(displayValue).join(", ");
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
    if (variantValue<number>(original, "Number") !== undefined) {
      const n = Number(t);
      return Number.isNaN(n) ? { Text: t } : { Number: n };
    }
    if (variantValue<boolean>(original, "Checkbox") !== undefined) {
      return { Checkbox: t === "true" || t === "yes" || t === "1" };
    }
    if (variantValue<string>(original, "Date") !== undefined)
      return { Date: t };
    if (variantValue<string>(original, "DateTime") !== undefined)
      return { DateTime: t };
    if (variantValue<string>(original, "Link") !== undefined) {
      return { Link: t.replace(/^\[\[|\]\]$/g, "") };
    }
    if (variantValue<string>(original, "Text") !== undefined)
      return { Text: t };
  }
  return inferValue(t);
}

/**
 * Inline live frontmatter editor. Replaces the YAML frontmatter block in the
 * editor canvas (a CodeMirror replacement decoration) without altering the
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
  private editWith(
    key: string,
    value?: FrontmatterValue,
    newKey?: string,
  ): void {
    const v = this.view;
    if (!v) return;
    this.edit(v, key, value, newKey);
  }

  /** Reuse the DOM only when the rendered model is identical, so unrelated
   * async refreshes don't blow away focus mid-edit. Compares only the fields
   * that drive rendering (avoids a full-document JSON.stringify per update). */
  eq(other: FrontmatterWidget): boolean {
    const a = this.model.entries;
    const b = other.model.entries;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].key !== b[i].key) return false;
      if (!frontmatterValuesEqual(a[i].value, b[i].value)) return false;
      const as = a[i].valueSpan;
      const bs = b[i].valueSpan;
      if (as.start !== bs.start || as.end !== bs.end) return false;
      const aks = a[i].keySpan;
      const bks = b[i].keySpan;
      if (aks.start !== bks.start || aks.end !== bks.end) return false;
    }
    return true;
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

    // Keep property navigation inside the widget. Native Tab/Shift+Tab still
    // follows DOM order, while arrows provide the same row-to-row movement as
    // Obsidian without taking control away from text inputs.
    root.addEventListener("keydown", (event) => {
      const e = event as KeyboardEvent;
      const target = e.target as HTMLElement | null;
      if (!target?.matches(".cm-fm-key, .cm-fm-value")) return;
      if (e.key === "Escape") {
        target.blur();
        e.preventDefault();
        return;
      }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const fields = Array.from(
        root.querySelectorAll<HTMLElement>(".cm-fm-key, .cm-fm-value"),
      );
      const index = fields.indexOf(target);
      const next = fields[index + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        next.focus();
        next.scrollIntoView({ block: "nearest" });
        e.preventDefault();
      } else if (e.key === "ArrowUp" && index === 0) {
        const title = root
          .closest(".cm-scroller")
          ?.querySelector<HTMLElement>("[data-basalt-inline-title]");
        if (title) {
          title.focus();
          e.preventDefault();
        }
      }
    });
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

    const icon = createFrontmatterIcon(entry);

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

    row.append(icon, keyInput, valueEl);
    return row;
  }

  private renderValue(entry: FrontmatterEntry): HTMLElement {
    const v = entry.value;
    if (typeof v !== "string") {
      const checkbox = variantValue<boolean>(v, "Checkbox");
      if (checkbox !== undefined) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "cm-fm-value cm-fm-checkbox";
        cb.checked = checkbox;
        cb.addEventListener("change", () =>
          this.editWith(entry.key, { Checkbox: cb.checked }),
        );
        return cb;
      }
      const list = variantValue<FrontmatterValue[]>(v, "List");
      if (list !== undefined) {
        return this.renderList(entry.key, list);
      }
    }
    const input = document.createElement("input");
    const date =
      typeof v !== "string" && variantValue<string>(v, "Date") !== undefined;
    const dateTime =
      typeof v !== "string" &&
      variantValue<string>(v, "DateTime") !== undefined;
    input.type = date ? "date" : dateTime ? "datetime-local" : "text";
    input.className = "cm-fm-value";
    input.value = dateTime ? displayValue(v).slice(0, 16) : displayValue(v);
    if (typeof v === "string") {
      input.classList.add("cm-fm-empty");
      input.placeholder = "Empty";
    }
    const commit = () =>
      this.editWith(entry.key, coerce(input.value, entry.value));
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
      add.setAttribute("role", "combobox");
      add.setAttribute("aria-autocomplete", "list");
      const suggestions = document.createElement("div");
      suggestions.className = "cm-fm-suggestions";
      suggestions.hidden = true;
      const populate = async () => {
        const prefix = add.value.trim().replace(/^#/, "");
        const tags =
          key === "tags" ? await this.fetch.onFetchTags?.(prefix) : undefined;
        const links =
          key === "aliases"
            ? await this.fetch.onFetchLinks?.(add.value)
            : undefined;
        const opts: string[] =
          key === "tags" ? (tags ?? []) : (links ?? []).map((l) => l.name);
        const present = new Set(items.map(displayValue));
        suggestions.replaceChildren(
          ...opts
            .filter((o) => !present.has(o))
            .map((o) => {
              const option = document.createElement("button");
              option.type = "button";
              option.className = "cm-fm-suggestion";
              option.textContent = o;
              option.addEventListener("mousedown", (event) =>
                event.preventDefault(),
              );
              option.addEventListener("click", () => {
                add.value = o;
                add.focus();
                suggestions.hidden = true;
              });
              return option;
            }),
        );
        suggestions.hidden = suggestions.childElementCount === 0;
      };
      add.addEventListener("focus", populate);
      add.addEventListener("input", populate);
      add.addEventListener("blur", () =>
        window.setTimeout(() => {
          suggestions.hidden = true;
        }, 120),
      );
      wrap.appendChild(suggestions);
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

    const action = document.createElement("button");
    action.type = "button";
    action.className = "cm-fm-add-action";
    action.textContent = "+ Add property";

    const keyInput = document.createElement("input");
    keyInput.className = "cm-fm-key";
    keyInput.placeholder = "property";

    const valInput = document.createElement("input");
    valInput.className = "cm-fm-value";
    valInput.placeholder = "value";

    const editor = document.createElement("div");
    editor.className = "cm-fm-add-editor";
    editor.append(keyInput, valInput);
    editor.hidden = true;

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

    action.addEventListener("click", () => {
      action.hidden = true;
      editor.hidden = false;
      keyInput.focus();
    });

    row.append(action, editor);
    return row;
  }
}
