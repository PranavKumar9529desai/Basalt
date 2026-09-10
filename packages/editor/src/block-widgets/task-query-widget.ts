import { Facet, type EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { BlockWidgetSpec } from "./registry";
import { renderModeFacet } from "../preview/render-mode";
import { createCodeToggleButton } from "./code-toggle-button";
import { escapeHtml, notifyViewOfSizeChange } from "./utils";
import { renderTaskQueryResult } from "./task-query-html";
import { parseTaskQuery } from "./task-query-parser";
import type { ParsedTaskQuery, RunTasksQueryFn } from "./task-query-types";
import type { OpenLinkFn, QueryResult, TypedValue } from "./dql-types";
import { openLinkFacet } from "./dql-widget";

export type {
  TaskQuery,
  TaskFilter,
  TaskSort,
  TaskDisplayOptions,
  ParsedTaskQuery,
  RunTasksQueryFn,
} from "./task-query-types";
export { parseTaskQuery } from "./task-query-parser";
export { TASK_WIDGET_THEME } from "./task-query-theme";
export type { TypedValue, QueryResult };

/**
 * Dependency facet — injected by the feature layer so this package stays pure
 * (no Tauri/IPC inside packages/, ADR-007). Calls the `get_tasks` command.
 */
export const getTasksQueryFacet = Facet.define<
  RunTasksQueryFn | undefined,
  RunTasksQueryFn | undefined
>({
  combine: (values) => values[0],
});

// Result cache keyed by date + normalized body — relative dates ("this week")
// resolve against "today", so results expire at midnight.
const taskCache = new Map<string, QueryResult>();

export function clearTaskQueryCache(): void {
  taskCache.clear();
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface TaskBlockModel {
  /** Raw instruction body between fences (cache + parse input). */
  body: string;
  /** Character offsets within the doc (used by the code toggle button). */
  from: number;
  to: number;
}

export class TaskQueryWidget extends WidgetType {
  constructor(
    private readonly body: string,
    private readonly runTasks: RunTasksQueryFn | undefined,
    private readonly onOpenLink: OpenLinkFn | undefined,
    private readonly from?: number,
    private readonly to?: number,
    private readonly isLive: boolean = true,
  ) {
    super();
  }

  eq(other: TaskQueryWidget): boolean {
    return (
      this.body === other.body &&
      this.from === other.from &&
      this.to === other.to &&
      this.isLive === other.isLive
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-task-result";

    if (this.isLive && this.from !== undefined) {
      const codeBtn = createCodeToggleButton(view, (v) => {
        v.dispatch({
          selection: { anchor: this.from! },
        });
      });
      div.appendChild(codeBtn);
    }

    const parsed = parseTaskQuery(this.body);
    const cacheKey = `${todayKey()}::${this.body}`;

    const content = document.createElement("div");
    const cached = taskCache.get(cacheKey);
    if (cached) {
      content.innerHTML = renderTaskQueryResult(cached, parsed);
      div.appendChild(content);
      this.bindLinks(div);
      return div;
    }

    content.innerHTML = '<div class="cm-task-loading">Loading tasks…</div>';
    div.appendChild(content);
    this.bindLinks(div);

    if (this.runTasks) {
      const body = this.body;
      this.runTasks(parsed.query)
        .then((result) => {
          taskCache.set(cacheKey, result);
          if (!div.isConnected || this.body !== body) return;
          content.innerHTML = renderTaskQueryResult(result, parsed);
          this.bindLinks(div);
          notifyViewOfSizeChange(div, view);
        })
        .catch((err) => {
          if (!div.isConnected || this.body !== body) return;
          content.innerHTML = `<div class="cm-task-error">Task query error: ${escapeHtml(String(err))}</div>`;
          notifyViewOfSizeChange(div, view);
        });
    } else {
      content.innerHTML = '<div class="cm-task-error">Task engine not available</div>';
    }

    return div;
  }

  /** Delegated click handler so backlinks open notes via onOpenLink. */
  private bindLinks(div: HTMLElement): void {
    const onOpenLink = this.onOpenLink;
    if (!onOpenLink) return;
    div.addEventListener("click", (event) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a.internal-link");
      if (!anchor) return;
      event.preventDefault();
      const name = anchor.getAttribute("data-name") ?? anchor.textContent ?? "";
      if (name) onOpenLink(name.trim());
    });
  }

  ignoreEvent() {
    return false; // allow clicks on links and the code toggle
  }
}

const TASK_LANGUAGES: Record<string, true> = {
  tasks: true,
  task: true,
};

const matches = (node: SyntaxNodeRef): boolean =>
  node.type.name === "FencedCode";

interface TaskBlockSpecModel extends TaskBlockModel {
  inCursor: boolean;
}

const parse = (
  state: EditorState,
  node: SyntaxNodeRef,
): TaskBlockSpecModel | null => {
  if (node.type.name !== "FencedCode") return null;

  const doc = state.doc;
  const startLine = doc.lineAt(node.from);
  const langMatch = startLine.text.match(/^```([^\s]*)/);
  const lang = langMatch ? langMatch[1].toLowerCase() : "";
  if (!(lang in TASK_LANGUAGES)) return null;

  const endLine = doc.lineAt(node.to);
  const bodyStart = startLine.to + 1;
  const bodyEnd = endLine.from;
  const body = bodyStart < bodyEnd ? doc.sliceString(bodyStart, bodyEnd).trim() : "";

  if (!body) return null;

  const headPos = state.selection.main.head;
  const inCursor =
    state.facet(renderModeFacet) === "live" &&
    headPos >= node.from &&
    headPos <= node.to;

  return { body, from: node.from, to: endLine.to, inCursor };
};

const span = (
  model: TaskBlockSpecModel,
): { from: number; to: number } | null => {
  if (model.inCursor) return null;
  return { from: model.from, to: model.to };
};

const renderWidget = (
  model: TaskBlockSpecModel,
  state: EditorState,
): TaskQueryWidget | null => {
  if (model.inCursor) return null;
  return new TaskQueryWidget(
    model.body,
    state.facet(getTasksQueryFacet),
    state.facet(openLinkFacet),
    model.from,
    model.to,
    state.facet(renderModeFacet) === "live",
  );
};

export const taskQueryBlockSpec: BlockWidgetSpec<TaskBlockSpecModel> = {
  id: "tasks",
  matches,
  parse,
  span,
  render: renderWidget,
};

export type { ParsedTaskQuery as TaskParsedQuery }; // compatibility alias