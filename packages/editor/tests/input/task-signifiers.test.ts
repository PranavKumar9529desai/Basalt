import { describe, expect, it } from "vitest";

import {
  cycleStatus,
  parseTaskSignifiers,
  statusToCheckboxChar,
  TASK_STATUS_CYCLE,
} from "../../src/input/task-signifiers";

describe("parseTaskSignifiers", () => {
  it("parses a plain todo checkbox", () => {
    const r = parseTaskSignifiers("- [ ] Buy groceries");
    expect(r).not.toBeNull();
    expect(r!.status).toBe("todo");
    expect(r!.priority).toBe("none");
    expect(r!.tags).toEqual([]);
  });

  it("parses a done checkbox", () => {
    const r = parseTaskSignifiers("- [x] Buy groceries");
    expect(r!.status).toBe("done");
  });

  it("parses in-progress and on-hold checkboxes", () => {
    expect(parseTaskSignifiers("- [/] WIP")!.status).toBe("in_progress");
    expect(parseTaskSignifiers("- [?] Waiting")!.status).toBe("on_hold");
  });

  it("parses cancelled checkbox", () => {
    expect(parseTaskSignifiers("- [-] Skip")!.status).toBe("cancelled");
  });

  it("parses uppercase X as done", () => {
    expect(parseTaskSignifiers("- [X] Done")!.status).toBe("done");
  });

  it("parses priority signifiers", () => {
    expect(parseTaskSignifiers("- [ ] Fix bug 🔺")!.priority).toBe("highest");
    expect(parseTaskSignifiers("- [ ] Fix bug ⏫")!.priority).toBe("high");
    expect(parseTaskSignifiers("- [ ] Fix bug 🔼")!.priority).toBe("medium");
    expect(parseTaskSignifiers("- [ ] Fix bug 🔽")!.priority).toBe("low");
    expect(parseTaskSignifiers("- [ ] Fix bug ⏬")!.priority).toBe("lowest");
  });

  it("priority before description is still parsed", () => {
    expect(parseTaskSignifiers("- [ ] 🔺 Fix bug")!.priority).toBe("highest");
  });

  it("parses due date", () => {
    const r = parseTaskSignifiers("- [ ] Pay rent 📅 2024-01-07");
    expect(r!.due).toBe("2024-01-07");
  });

  it("parses all date signifiers", () => {
    const r = parseTaskSignifiers(
      "- [ ] Launch 🛫 2024-01-01 📅 2024-01-07 ⏳ 2024-01-05 ➕ 2024-01-01 ✅ 2024-01-07 ❌ 2024-01-06",
    );
    expect(r!.start).toBe("2024-01-01");
    expect(r!.due).toBe("2024-01-07");
    expect(r!.scheduled).toBe("2024-01-05");
    expect(r!.created).toBe("2024-01-01");
    expect(r!.doneDate).toBe("2024-01-07");
    expect(r!.cancelled).toBe("2024-01-06");
  });

  it("parses recurrence rule", () => {
    const r = parseTaskSignifiers("- [ ] Morning run 🔁 every week on Monday");
    expect(r!.recurrence).toBe("every week on Monday");
  });

  it("stops recurrence at the next signifier", () => {
    const r = parseTaskSignifiers(
      "- [ ] Walk 🔁 every day 📅 2024-01-07",
    );
    expect(r!.recurrence).toBe("every day");
    expect(r!.due).toBe("2024-01-07");
  });

  it("parses tags", () => {
    const r = parseTaskSignifiers("- [ ] Ship notes #work #urgent");
    expect(r!.tags).toEqual(["#work", "#urgent"]);
  });

  it("ignores hash inside words (not a tag)", () => {
    const r = parseTaskSignifiers("- [ ] Use C# for backend");
    expect(r!.tags).toEqual([]);
  });

  it("returns null for non-task lines", () => {
    expect(parseTaskSignifiers("- plain list item")).toBeNull();
    expect(parseTaskSignifiers("# Heading")).toBeNull();
    expect(parseTaskSignifiers("")).toBeNull();
  });

  it("parses indented/nested task lines", () => {
    const r = parseTaskSignifiers("  - [ ] Nested task 🔺");
    expect(r!.priority).toBe("highest");
    expect(r!.status).toBe("todo");
  });

  it("parses ordered-list tasks", () => {
    const r = parseTaskSignifiers("1. [ ] Ordered task");
    expect(r!.status).toBe("todo");
  });

  it("does not choke on emoji in the description", () => {
    const r = parseTaskSignifiers("- [ ] 🎉 Party planning 📅 2024-01-07");
    expect(r!.due).toBe("2024-01-07");
  });

  it("parses combined signifiers in any order", () => {
    const r = parseTaskSignifiers(
      "- [x] Completed task 🔁 every week 📅 2024-01-07 #done",
    );
    expect(r!.status).toBe("done");
    expect(r!.recurrence).toBe("every week");
    expect(r!.due).toBe("2024-01-07");
    expect(r!.tags).toEqual(["#done"]);
  });
});

describe("statusToCheckboxChar", () => {
  it("maps status names to checkbox characters", () => {
    expect(statusToCheckboxChar("todo")).toBe(" ");
    expect(statusToCheckboxChar("in_progress")).toBe("/");
    expect(statusToCheckboxChar("on_hold")).toBe("?");
    expect(statusToCheckboxChar("done")).toBe("x");
    expect(statusToCheckboxChar("cancelled")).toBe("-");
  });

  it("falls back to todo for unknown status", () => {
    expect(statusToCheckboxChar("bogus")).toBe(" ");
  });
});

describe("cycleStatus", () => {
  it("cycles through the default sequence", () => {
    expect(TASK_STATUS_CYCLE).toEqual(["todo", "in_progress", "done"]);
    expect(cycleStatus("todo")).toBe("in_progress");
    expect(cycleStatus("in_progress")).toBe("done");
    expect(cycleStatus("done")).toBe("todo");
  });

  it("starts from the beginning for unknown status", () => {
    expect(cycleStatus("canceled-misspelled")).toBe("todo");
  });

  it("returns a todo for a cancelled task (cycle wraps)", () => {
    expect(cycleStatus("cancelled")).toBe("todo");
  });
});