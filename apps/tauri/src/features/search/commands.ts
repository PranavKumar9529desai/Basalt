import { invoke } from "@tauri-apps/api/core";
import { commandService } from "@workspace/commands";
import { formatSearchBenchmarkReport, runSearchBenchmark } from "./benchmark";
import { useSearchStore } from "./store";

commandService.registerCommand(
  "search:open",
  useSearchStore.getState().openSearch,
);
commandService.registerCommand(
  "switcher:open",
  useSearchStore.getState().openSwitcher,
);

// Dev: search modal benchmark (frontend counterpart of the basalt-search
// criterion benches). Results go to a temp file via write_dev_report so prod
// runs need NO devtools open (devtools inflate measurements).
commandService.registerCommand("dev:search-benchmark", () => {
  void (async () => {
    try {
      console.time("search-benchmark");
      const rows = await runSearchBenchmark();
      console.timeEnd("search-benchmark");
      console.table(rows);
      const path = await invoke<string>("write_dev_report", {
        fileName: "search-benchmark.md",
        contents: formatSearchBenchmarkReport(rows),
      });
      console.log(`[search] benchmark report written to ${path}`);
    } catch (err) {
      console.error("[search] search benchmark failed:", err);
    }
  })();
});
