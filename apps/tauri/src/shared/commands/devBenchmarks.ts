/**
 * devBenchmarks — typing-latency benchmarks + main-thread watchdog
 * (ADR-019/020 gate). Registered only in dev builds — they are measurement
 * infrastructure, not product features. ADR-038 §3: split out of
 * shared/editorCommands.
 */
import { invoke } from "@tauri-apps/api/core";
import { commandService } from "@workspace/commands";
import {
  createEditorExtensionGroups,
  formatBenchmarkReport,
  formatWatchdogReport,
  getWatchdogStats,
  runIsolationBenchmark,
  runTypingBenchmark,
  startWatchdog,
  stopWatchdog,
  type BenchmarkReportRow,
} from "@workspace/editor";
import { resolveActiveController } from "../activeEditor";
import { getActiveView } from "./editorCommands";

if (import.meta.env.DEV) {
  let watchdogActive = false;

  const report = async (title: string, rows: BenchmarkReportRow[]) => {
    console.table(rows);
    const md = formatBenchmarkReport(title, rows);
    try {
      const path = await invoke<string>("write_dev_report", {
        fileName: "editor-benchmark.md",
        contents: md,
      });
      resolveActiveController()?.io.setStatus(`Benchmark written to ${path}`);
    } catch (err) {
      console.error("[editorCommands] report write failed:", err);
      resolveActiveController()?.io.setStatus(
        "Benchmark done; report write failed (see console)",
      );
    }
  };

  commandService.registerCommand("dev:editor-benchmark", () => {
    const view = getActiveView();
    if (!view) return;
    try {
      void report(
        "Editor typing benchmark — full extension stack",
        runTypingBenchmark(view),
      );
    } catch (err) {
      console.error("[editorCommands] benchmark failed:", err);
    }
  });

  commandService.registerCommand("dev:editor-benchmark-isolation", () => {
    const view = getActiveView();
    if (!view) return;
    try {
      const controller = resolveActiveController();
      if (!controller) return;
      // Fresh groups per run — never share plugin instances with states
      // other than the ones they were built for.
      const g = createEditorExtensionGroups({
        onFetchLinks: controller.io.onFetchLinks,
        onFetchTags: controller.io.onFetchTags,
        onOpenLink: controller.handleOpenLink,
        parseFrontmatter: controller.io.parseFrontmatter,
        runQuery: controller.io.runQuery,
      });
      const full = [
        ...g.base,
        ...g.syntax,
        ...g.input,
        ...g.livePreview,
        ...g.suggestions,
        ...g.links,
        ...g.blockWidgets,
      ];
      const results = runIsolationBenchmark(view, [
        { name: "base", extensions: g.base },
        { name: "+syntax", extensions: [...g.base, ...g.syntax] },
        { name: "+input", extensions: [...g.base, ...g.input] },
        { name: "+live-preview", extensions: [...g.base, ...g.livePreview] },
        { name: "+suggestions", extensions: [...g.base, ...g.suggestions] },
        { name: "+links", extensions: [...g.base, ...g.links] },
        {
          name: "+block-widgets",
          extensions: [...g.base, ...g.blockWidgets],
        },
        { name: "full", extensions: full },
      ]);
      void report("Editor typing benchmark — extension isolation", results);
    } catch (err) {
      console.error("[editorCommands] isolation benchmark failed:", err);
    }
  });

  commandService.registerCommand("dev:watchdog", () => {
    if (watchdogActive) {
      stopWatchdog();
      watchdogActive = false;
      resolveActiveController()?.io.setStatus("Watchdog stopped");
    } else {
      startWatchdog(100);
      watchdogActive = true;
      resolveActiveController()?.io.setStatus(
        "Watchdog started (100ms threshold)",
      );
    }
  });

  commandService.registerCommand("dev:watchdog-report", async () => {
    const s = getWatchdogStats();
    const md = formatWatchdogReport(s);
    try {
      const path = await invoke<string>("write_dev_report", {
        fileName: "watchdog-report.md",
        contents: md,
      });
      resolveActiveController()?.io.setStatus(
        `Watchdog report written to ${path}`,
      );
    } catch (err) {
      console.error("[editorCommands] watchdog report write failed:", err);
      resolveActiveController()?.io.setStatus(
        "Watchdog report failed (see console)",
      );
    }
  });
}