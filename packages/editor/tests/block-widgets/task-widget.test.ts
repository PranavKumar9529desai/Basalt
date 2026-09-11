import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { QueryResult } from "../../src/block-widgets/dql-types";
import { createEditorExtensions } from "../../src/editor";
import {
  clearTaskQueryCache,
  TaskQueryWidget,
} from "../../src/block-widgets/task-query-widget";
import { renderTaskQueryResult } from "../../src/block-widgets/task-query-html";
import { parseTaskQuery } from "../../src/block-widgets/task-query-parser";

const TASK_RESULT: QueryResult = {
  columns: [
    { name: "File", type: "link" },
    { name: "Description", type: "text" },
    { name: "Status", type: "text" },
    { name: "Priority", type: "text" },
    { name: "Due", type: "date" },
    { name: "Scheduled", type: "date" },
    { name: "Tags", type: "list" },
    { name: "Urgency", type: "number" },
    { name: "Path", type: "text" },
    { name: "Line", type: "number" },
  ],
  rows: [
    [
      { type: "link", name: "Plan", path: "docs/plan.md" },
      { type: "text", value: "Ship ADR-048" },
      { type: "text", value: "in_progress" },
      { type: "text", value: "high" },
      { type: "date", value: "2026-09-15" },
      { type: "date", value: "2026-09-10" },
      { type: "list", items: [{ type: "text", value: "work" }] },
      { type: "number", value: 8 },
      { type: "text", value: "docs/plan.md" },
      { type: "number", value: 3 },
    ],
    [
      { type: "link", name: "Ideas", path: "inbox/ideas.md" },
      { type: "text", value: "Sketch v2" },
      { type: "text", value: "todo" },
      { type: "text", value: "none" },
      { type: "null" },
      { type: "null" },
      { type: "list", items: [] },
      { type: "number", value: 3 },
      { type: "text", value: "inbox/ideas.md" },
      { type: "number", value: 7 },
    ],
  ],
  total: 2,
};

describe("renderTaskQueryResult", () => {
  const parsed = parseTaskQuery("not done\nshow urgency");

  it("renders checkbox status, priority badge, tags and urgency chip", () => {
    const html = renderTaskQueryResult(TASK_RESULT, parsed);
    expect(html).toContain('data-status="in_progress"');
    expect(html).toContain('data-status="todo"');
    expect(html).toContain("Ship ADR-048");
    expect(html).toContain("cm-task-priority--high");
    expect(html).toContain("#work");
    expect(html).toContain("urgency 8");
    expect(html).toContain("cm-task-backlink");
  });

  it("renders grouped output when group by status is requested", () => {
    const g = parseTaskQuery("group by status");
    const html = renderTaskQueryResult(TASK_RESULT, g);
    expect(html).toContain("cm-task-group-title");
    expect(html).toContain("in_progress");
    expect(html).toContain("todo");
  });

  it("renders an empty state for no rows", () => {
    const html = renderTaskQueryResult(
      { columns: [], rows: [], total: 0 },
      parseTaskQuery("done"),
    );
    expect(html).toContain("cm-task-empty");
  });

  it("surfaces unsupported instructions in the footer", () => {
    const p = parseTaskQuery("bogus line");
    const html = renderTaskQueryResult(TASK_RESULT, p);
    expect(html).toContain("cm-task-unsupported");
    expect(html).toContain("bogus line");
  });
});

describe("TaskQueryWidget layout + async result", () => {
  beforeEach(() => clearTaskQueryCache());
  afterEach(() => document.body.replaceChildren());

  it("replaces the loading placeholder with the rendered result", async () => {
    const requestMeasure = vi.fn();
    const view = { requestMeasure } as unknown as EditorView;
    const runTasks = vi.fn().mockResolvedValue(TASK_RESULT);
    const widget = new TaskQueryWidget("not done", runTasks, undefined);

    const dom = widget.toDOM(view);
    document.body.appendChild(dom);

    expect(dom.innerHTML).toContain("cm-task-loading");
    expect(requestMeasure).not.toHaveBeenCalled();

    await runTasks({ filters: [], sorts: [], groups: [], limit: null });

    expect(dom.innerHTML).toContain("cm-task-item");
    expect(requestMeasure).toHaveBeenCalled();
  });

  it("renders cached results synchronously", () => {
    // Prime the cache with the same body for today, then render again.
    const view = { requestMeasure: vi.fn() } as unknown as EditorView;
    const first = new TaskQueryWidget(
      "not done",
      async () => TASK_RESULT,
      undefined,
    );
    const dom = first.toDOM(view);
    document.body.appendChild(dom);
    void dom; // async settles into cache via the promise chain

    return Promise.resolve().then(() => {
      const second = new TaskQueryWidget("not done", undefined, undefined);
      const dom2 = second.toDOM(view);
      expect(dom2.innerHTML).toContain("cm-task-item");
      expect(dom2.querySelector(".cm-task-loading")).toBeNull();
    });
  });

  it("shows an error state when the engine rejects", async () => {
    const runTasks = vi.fn().mockRejectedValue(new Error("boom"));
    const widget = new TaskQueryWidget("not done", runTasks, undefined);
    const dom = widget.toDOM({
      requestMeasure: vi.fn(),
    } as unknown as EditorView);
    document.body.appendChild(dom);
    // The widget's own .catch paints the error; flush the microtask queue.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(dom.innerHTML).toContain("Task query error: Error: boom");
  });
});

describe("```tasks block end-to-end through createEditorExtensions", () => {
  afterEach(() => document.body.replaceChildren());

  it("renders a task list widget for a tasks fenced block", async () => {
    const runTasks = vi.fn().mockResolvedValue(TASK_RESULT);
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const view = new EditorView({
      state: EditorState.create({
        doc: "before\n```tasks\nnot done\n```\nafter",
        extensions: createEditorExtensions({ runTasksQuery: runTasks }),
      }),
      parent,
    });
    // Let the async widget fetch settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(parent.innerHTML).toContain("cm-task-item");
    expect(parent.innerHTML).toContain("Ship ADR-048");
    // The query sent to the engine is the parsed TaskQuery.
    expect(runTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ field: "status", op: "not_done", value: "" }],
      }),
    );
    view.destroy();
  });

  it("does not render for non-tasks fenced blocks", async () => {
    const runTasks = vi.fn();
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const view = new EditorView({
      state: EditorState.create({
        doc: '```dql\nTABLE FROM "/"\n```',
        extensions: createEditorExtensions({ runTasksQuery: runTasks }),
      }),
      parent,
    });
    await Promise.resolve();
    expect(parent.innerHTML).not.toContain("cm-task-item");
    expect(runTasks).not.toHaveBeenCalled();
    view.destroy();
  });
});
