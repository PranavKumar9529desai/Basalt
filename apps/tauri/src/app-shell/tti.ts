import { invoke } from "@tauri-apps/api/core";

/**
 * TTI instrumentation (ADR-017 counterpart on the boot path).
 *
 * Marks are collected at key startup points (module eval, router loader,
 * first workspace paint) and merged with the Rust-side phase timings that
 * arrive inside `BootResult.timings`. The combined report is written to the
 * temp reports dir via the existing `write_dev_report` command so prod runs
 * need NO devtools open — same pattern as the editor benchmark.
 *
 * Clock notes:
 * - Frontend marks use `performance.now()` (ms since webview navigation start).
 * - Rust timings are µs durations; `process_to_invoke` is anchored at process
 *   spawn (`PROCESS_START` in lib.rs), which the webview cannot see.
 * - "TTI (process est.)" assumes the invoke dispatches immediately after the
 *   loader starts and adds the measured loader→paint tail onto it.
 */

const marks: Record<string, number> = {};
/** One report per session — StrictMode double-mounts must not double-write. */
let reported = false;

export function ttiMark(name: string): void {
  if (marks[name] === undefined) marks[name] = performance.now();
}

export interface TtiBootMeta {
  status: string;
  note_count: number;
  /** Rust phase durations in µs, straight from BootResult.timings. */
  timings?: Record<string, number>;
}

export async function writeTtiReport(meta: TtiBootMeta): Promise<void> {
  if (reported) return;
  reported = true;

  const m = (n: string) => marks[n];
  const has = (...ns: string[]) => ns.every((n) => marks[n] !== undefined);

  const rows: { phase: string; ms: number }[] = [];
  const push = (phase: string, ms: number | undefined) => {
    if (ms !== undefined && Number.isFinite(ms)) rows.push({ phase, ms });
  };

  if (has("js_entry", "loader_start"))
    push("webview: js entry → loader start", m("loader_start") - m("js_entry"));
  if (has("loader_start", "boot_resolved"))
    push(
      "loader: invoke(boot) round-trip",
      m("boot_resolved") - m("loader_start"),
    );
  if (has("boot_resolved", "workspace_painted"))
    push(
      "react: boot resolved → workspace painted",
      m("workspace_painted") - m("boot_resolved"),
    );
  if (m("workspace_painted") !== undefined)
    push("TTI (webview): nav start → painted", m("workspace_painted"));

  const processToInvokeMs = meta.timings?.process_to_invoke
    ? meta.timings.process_to_invoke / 1000
    : undefined;
  if (
    processToInvokeMs !== undefined &&
    has("loader_start", "workspace_painted")
  ) {
    push(
      "TTI (process est.): spawn → painted",
      processToInvokeMs + (m("workspace_painted") - m("loader_start")),
    );
  }

  console.table(rows);

  const lines = [
    "# Boot / TTI report",
    "",
    `- timestamp: ${new Date().toISOString()}`,
    `- ua: ${navigator.userAgent}`,
    `- vault status: ${meta.status} (${meta.note_count} notes)`,
    "- target: <800ms TTI (AGENTS.md)",
    "",
    "## End-to-end",
    "",
    "| phase | ms |",
    "|---|---|",
    ...rows.map((r) => `| ${r.phase} | ${r.ms.toFixed(1)} |`),
    "",
    "## Rust boot phases (from BootResult.timings)",
    "",
    "| phase | ms |",
    "|---|---|",
    ...Object.entries(meta.timings ?? {})
      .filter(([k]) => k.startsWith("rust:"))
      .map(([k, us]) => `| ${k.slice(5)} | ${(us / 1000).toFixed(2)} |`),
    "",
  ];
  const md = lines.join("\n");

  try {
    const path = await invoke<string>("write_dev_report", {
      fileName: "tti-report.md",
      contents: md,
    });
    console.info(`[tti] report written to ${path}`);
  } catch (err) {
    console.error("[tti] report write failed:", err);
  }
}
