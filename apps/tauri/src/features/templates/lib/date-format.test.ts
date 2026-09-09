import { describe, expect, it } from "vitest";

import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  formatDate,
} from "./date-format";

// 2026-09-07 is a Monday; 15:05:09 local.
const NOW = new Date(2026, 8, 7, 15, 5, 9);

describe("formatDate", () => {
  it("formats the ISO-style date tokens", () => {
    expect(formatDate(NOW, "YYYY-MM-DD")).toBe("2026-09-07");
    expect(formatDate(NOW, "YYYY/MM/DD")).toBe("2026/09/07");
    expect(formatDate(NOW, "YY-M-D")).toBe("26-9-7");
  });

  it("formats month and weekday names", () => {
    expect(formatDate(NOW, "MMMM D, YYYY")).toBe("September 7, 2026");
    expect(formatDate(NOW, "ddd, MMM D")).toBe("Mon, Sep 7");
    expect(formatDate(NOW, "dddd")).toBe("Monday");
  });

  it("formats 24-hour and 12-hour clock tokens", () => {
    expect(formatDate(NOW, "HH:mm:ss")).toBe("15:05:09");
    expect(formatDate(NOW, "h:mm A")).toBe("3:05 PM");
    expect(formatDate(NOW, "h:mm a")).toBe("3:05 pm");
  });

  it("formats midnight and noon on the 12-hour clock", () => {
    expect(formatDate(new Date(2026, 8, 7, 0, 0), "h A")).toBe("12 AM");
    expect(formatDate(new Date(2026, 8, 7, 12, 0), "h A")).toBe("12 PM");
  });

  it("passes literal text through and unescapes bracket literals", () => {
    expect(formatDate(NOW, "YYYY-[Q]1")).toBe("2026-Q1");
    expect(formatDate(NOW, "note/YYYY/MM/DD")).toBe("note/2026/09/07");
  });

  it("is stable for nested daily-note path formats", () => {
    expect(formatDate(NOW, "YYYY/MMMM/YYYY-MMM-DD")).toBe(
      "2026/September/2026-Sep-07",
    );
  });

  it("renders the bare-variable defaults", () => {
    expect(formatDate(NOW, DEFAULT_DATE_FORMAT)).toBe("2026-09-07");
    expect(formatDate(NOW, DEFAULT_TIME_FORMAT)).toBe("15:05");
  });
});
