import { describe, expect, it } from "vitest";
import { decideReconcileAction } from "./reconcile";

describe("decideReconcileAction", () => {
  it("ignores when disk content matches the editor doc (echo / no-op)", () => {
    expect(decideReconcileAction("hello", "hello", true)).toBe("ignore");
    expect(decideReconcileAction("hello", "hello", false)).toBe("ignore");
  });

  it("flags a conflict when the doc differs AND the tab has unsaved edits", () => {
    expect(decideReconcileAction("mine", "theirs", true)).toBe("conflict");
  });

  it("reloads from disk when the doc differs but the tab is clean", () => {
    expect(decideReconcileAction("mine", "theirs", false)).toBe("reload");
  });

  it("treats differing newlines/whitespace as a real difference", () => {
    expect(decideReconcileAction("a\nb", "a\r\nb", false)).toBe("reload");
  });
});