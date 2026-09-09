import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  createEditorExtensions,
  formatBenchmarkReport,
  runTypingBenchmark,
} from "../../src";

describe("Editor Typing Latency Benchmark — ADR-040 Tiers", () => {
  it("runs the full suite across document sizes and reports p50/p95/max", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const extensions = createEditorExtensions({});
    const state = EditorState.create({
      doc: "# Initial Doc\n\nSome text.",
      extensions,
    });
    const view = new EditorView({ state, parent });

    // Measure across 1KB, 10KB, and 100KB
    const results = runTypingBenchmark(view, {
      sizes: [1024, 10 * 1024, 100 * 1024],
      keystrokes: 40,
      warmup: 5,
    });

    const report = formatBenchmarkReport(
      "Basalt Editor Typing Latency Benchmark — ADR-040 Tiers",
      results,
    );

    // Print to console so it is clearly visible in the test run output
    console.log("\n" + report + "\n");

    expect(results.length).toBe(3); // 3 sizes: 1KB, 10KB, 100KB
    for (const r of results) {
      expect(r.samples).toBe(40);
      expect(r.p50Ms).toBeGreaterThan(0);
      expect(r.p95Ms).toBeGreaterThan(0);
    }

    view.destroy();
    parent.remove();
  }, 60000); // 60s timeout for 100KB suite
});
