import { describe, expect, it } from "vitest";

import { expandTemplate } from "./expand-template";

const NOW = new Date(2026, 8, 7, 15, 5); // Monday, 2026-09-07 15:05

describe("expandTemplate", () => {
  it("expands {{title}}, {{date}} and {{time}} in one pass", () => {
    expect(
      expandTemplate("# {{title}}\n\nCreated {{date}} at {{time}}.", {
        title: "2026-09-07",
        now: NOW,
      }),
    ).toBe("# 2026-09-07\n\nCreated 2026-09-07 at 15:05.");
  });

  it("honors colon format overrides", () => {
    expect(
      expandTemplate("{{date:YYYY/MM/DD}} {{time:hh:mm A}}", {
        title: "x",
        now: NOW,
      }),
    ).toBe("2026/09/07 03:05 PM");
    expect(
      expandTemplate("{{date:dddd, MMMM D}}", { title: "x", now: NOW }),
    ).toBe("Monday, September 7");
  });

  it("respects context format overrides for bare variables", () => {
    expect(
      expandTemplate("{{date}} {{time}}", {
        title: "x",
        now: NOW,
        dateFormat: "M/D/YY",
        timeFormat: "H:mm",
      }),
    ).toBe("9/7/26 15:05");
  });

  it("ignores a format argument on {{title}}", () => {
    expect(expandTemplate("{{title:XX}}", { title: "Daily", now: NOW })).toBe(
      "Daily",
    );
  });

  it("passes through text without variables unchanged", () => {
    expect(expandTemplate("# Meeting\n\nAgenda:\n- one", { title: "x", now: NOW })).toBe(
      "# Meeting\n\nAgenda:\n- one",
    );
  });

  it("handles whitespace inside the braces", () => {
    expect(expandTemplate("{{ date }}", { title: "x", now: NOW })).toBe(
      "2026-09-07",
    );
    expect(expandTemplate("{{date: YYYY/MM }}", { title: "x", now: NOW })).toBe(
      "2026/09",
    );
  });
});