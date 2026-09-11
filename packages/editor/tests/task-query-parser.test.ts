import { describe, expect, it } from "vitest";
import { parseTaskQuery, splitInstructions } from "../src/block-widgets/task-query-parser";

describe("splitInstructions", () => {
  it("splits lines and skips empty + comment lines", () => {
    expect(splitInstructions("# all tasks\n\ndone\n\nnot done\n")).toEqual([
      "done",
      "not done",
    ]);
  });
});

describe("parseTaskQuery — status", () => {
  it("parses done / not done", () => {
    expect(parseTaskQuery("done")).toMatchObject({
      query: {
        // Dedicated `done` op → engine is_done() (done + cancelled + non_task).
        filters: [{ field: "status", op: "done", value: "" }],
        sorts: [],
        groups: [],
        limit: null,
      },
    });
    const open = parseTaskQuery("not done");
    expect(open.query.filters[0]).toEqual({
      field: "status",
      op: "not_done", // engine is_todo() — excludes done AND cancelled
      value: "",
    });
  });

  it("parses status is <name> and status.type is <type>", () => {
    const a = parseTaskQuery("status is in_progress");
    expect(a.query.filters[0]).toEqual({
      field: "status",
      op: "equals",
      value: "in_progress",
    });
    const b = parseTaskQuery("status.type is TODO");
    expect(b.query.filters[0].value).toBe("todo");
  });
});

describe("parseTaskQuery — priority", () => {
  it("parses priority above / below / is", () => {
    expect(parseTaskQuery("priority above medium").query.filters[0]).toEqual({
      field: "priority",
      op: "above",
      value: "medium",
    });
    expect(parseTaskQuery("priority below high").query.filters[0]).toEqual({
      field: "priority",
      op: "below",
      value: "high",
    });
    expect(parseTaskQuery("priority is highest").query.filters[0]).toEqual({
      field: "priority",
      op: "equals",
      value: "highest",
    });
  });
});

describe("parseTaskQuery — dates", () => {
  const today = new Date(2026, 8, 10); // 2026-09-10 (Thursday)

  it("parses absolute date comparisons", () => {
    const q = parseTaskQuery("due before 2026-09-01", today);
    expect(q.query.filters).toContainEqual({
      field: "due",
      op: "before",
      value: "2026-09-01",
    });
    const on = parseTaskQuery("due on 2026-09-01", today);
    expect(on.query.filters[0]).toEqual({
      field: "due",
      op: "equals",
      value: "2026-09-01",
    });
    expect(parseTaskQuery("due after 2026-09-01", today).query.filters[0]).toEqual({
      field: "due",
      op: "after",
      value: "2026-09-01",
    });
    // on-or-before is preserved as an inclusive bound (engine: d <= target)
    expect(parseTaskQuery("due on or before 2026-09-01", today).query.filters[0]).toEqual({
      field: "due",
      op: "on_or_before",
      value: "2026-09-01",
    });
  });

  it("expands relative date tokens to two-bound filters", () => {
    const q = parseTaskQuery("due this week", today);
    // 2026-09-10 is a Thursday → week runs Mon 2026-09-07 … Sun 2026-09-13
    expect(q.query.filters).toContainEqual({
      field: "due",
      op: "on_or_after",
      value: "2026-09-07",
    });
    expect(q.query.filters).toContainEqual({
      field: "due",
      op: "on_or_before",
      value: "2026-09-13",
    });
  });

  it("parses single-day relative tokens as equality", () => {
    const q = parseTaskQuery("due tomorrow", today);
    expect(q.query.filters).toEqual([
      { field: "due", op: "equals", value: "2026-09-11" },
    ]);
  });

  it("parses no-due-date and due-exists", () => {
    expect(parseTaskQuery("no due date", today).query.filters[0]).toEqual({
      field: "due",
      op: "is_empty",
      value: "",
    });
    expect(parseTaskQuery("due exists", today).query.filters[0]).toEqual({
      field: "due",
      op: "exists",
      value: "",
    });
  });

  it("supports scheduled/start/created/happens fields", () => {
    expect(parseTaskQuery("happens before 2026-10-01", today).query.filters[0]).toEqual({
      field: "happens",
      op: "before",
      value: "2026-10-01",
    });
    expect(parseTaskQuery("created after 2026-01-01", today).query.filters[0].field).toBe("created");
  });
});

describe("parseTaskQuery — text fields", () => {
  it("parses description includes with quotes stripped", () => {
    expect(parseTaskQuery('description includes "buy milk"').query.filters[0]).toEqual({
      field: "description",
      op: "includes",
      value: "buy milk",
    });
  });
  it("parses tags include with leading # stripped", () => {
    expect(parseTaskQuery("tags include #work").query.filters[0]).toEqual({
      field: "tags",
      op: "includes",
      value: "work",
    });
  });
  it("parses path/folder/filename includes", () => {
    expect(parseTaskQuery("path includes Projects/").query.filters[0]).toEqual({
      field: "path",
      op: "includes",
      value: "Projects/",
    });
    expect(parseTaskQuery("folder includes work").query.filters[0].field).toBe("folder");
    expect(parseTaskQuery("filename includes plan").query.filters[0].field).toBe("filename");
  });
});

describe("parseTaskQuery — recurrence and dependencies", () => {
  it("parses is recurring / is not recurring", () => {
    expect(parseTaskQuery("is recurring").query.filters[0]).toEqual({
      field: "recurrence",
      op: "exists",
      value: "",
    });
    expect(parseTaskQuery("is not recurring").query.filters[0]).toEqual({
      field: "recurrence",
      op: "is_empty",
      value: "",
    });
  });
  it("parses is blocked / is not blocked", () => {
    expect(parseTaskQuery("is blocked").query.filters[0]).toEqual({
      field: "depends_on",
      op: "exists",
      value: "",
    });
    expect(parseTaskQuery("is not blocked").query.filters[0]).toEqual({
      field: "depends_on",
      op: "is_empty",
      value: "",
    });
  });
});

describe("parseTaskQuery — sorts, groups, limit", () => {
  it("parses sort by field with optional reverse", () => {
    expect(parseTaskQuery("sort by due").query.sorts).toEqual([{ field: "due", reverse: false }]);
    expect(parseTaskQuery("sort by priority reverse").query.sorts[0]).toEqual({
      field: "priority",
      reverse: true,
    });
    expect(parseTaskQuery("sort by status.type").query.sorts[0].field).toBe("status");
  });

  it("parses group by", () => {
    expect(parseTaskQuery("group by status").query.groups).toEqual(["status"]);
  });

  it("parses limit", () => {
    expect(parseTaskQuery("limit 25").query.limit).toBe(25);
  });
});

describe("parseTaskQuery — display options", () => {
  it("applies short mode toggles", () => {
    const { display } = parseTaskQuery("short mode");
    expect(display.shortMode).toBe(true);
    expect(display.hidePriority).toBe(true);
    expect(display.hideScheduled).toBe(true);
  });

  it("applies individual hide options", () => {
    const { display } = parseTaskQuery("hide priority\nhide due date\nshow urgency");
    expect(display.hidePriority).toBe(true);
    expect(display.hideDue).toBe(true);
    expect(display.showUrgency).toBe(true);
  });
});

describe("parseTaskQuery — unsupported", () => {
  it("collects unrecognized lines, filters all ANDed", () => {
    const parsed = parseTaskQuery("not done\nsort by due\nbogus instruction");
    expect(parsed.unsupported).toEqual(["bogus instruction"]);
    expect(parsed.query.filters).toHaveLength(1);
    expect(parsed.query.sorts).toHaveLength(1);
  });

  it("flags unsupported sort fields", () => {
    const parsed = parseTaskQuery("sort by random");
    expect(parsed.unsupported).toEqual(["unsupported sort: random"]);
  });
});

describe("parseTaskQuery — full query shape", () => {
  it("combines multiple lines into one AND query", () => {
    const parsed = parseTaskQuery(
      "not done\npriority above medium\ndue before 2026-12-31\nlimit 50",
    );
    expect(parsed.query.filters).toHaveLength(3);
    expect(parsed.query.limit).toBe(50);
    expect(parsed.query.groups).toHaveLength(0);
  });
});