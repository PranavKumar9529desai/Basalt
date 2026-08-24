import { EditorState, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// ---------------------------------------------------------------------------
// Editor typing benchmark — the frontend counterpart of ADR-017.
//
// Measures the REAL per-keystroke cost of the live EditorView (all
// extensions included: live preview, wikilinks, suggestions, …) across
// document sizes. This is the number the editor performance campaign
// optimizes; run it before and after every change.
//
// Safety: while a benchmark runs, `editorBenchmarkState.active` is set —
// the app's update listener must check it and skip dirty/autosave/stats
// handling, so benchmark documents are never saved into user files.
// The original document is restored synchronously at the end.
//
// Note: dispatches are synchronous — large sizes block the UI for the
// duration. Default sizes stay ≤ 100KB for that reason.
// ---------------------------------------------------------------------------

/** Set while a benchmark is running. Update listeners must skip work. */
export const editorBenchmarkState = { active: false };

// ── Deterministic fixture generation ─────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "performance",
  "editor",
  "latency",
  "keystroke",
  "benchmark",
  "document",
  "viewport",
  "decoration",
  "transaction",
  "syntax",
  "highlight",
  "wikilink",
  "preview",
  "measure",
  "baseline",
  "regression",
];

function sentence(rand: () => number): string {
  const n = 8 + Math.floor(rand() * 12);
  const words: string[] = [];
  for (let i = 0; i < n; i++)
    words.push(WORDS[Math.floor(rand() * WORDS.length)]);
  const s = words.join(" ");
  return `${s.charAt(0).toUpperCase() + s.slice(1)}.`;
}

function block(rand: () => number, index: number): string {
  const kind = index % 7;
  switch (kind) {
    case 0:
      return `## Heading ${index} — ${sentence(rand)}`;
    case 1:
      return `${sentence(rand)} ${sentence(rand)}`;
    case 2:
      return `- item ${index}a ${sentence(rand)}\n- item ${index}b [[linked note ${index}]]\n- item ${index}c`;
    case 3:
      return `> [!note] Callout ${index}\n> ${sentence(rand)}`;
    case 4:
      return `\`\`\`rust
fn example_${index}() -> u32 {
    40 + 2
}
\`\`\``;
    case 5:
      return `#tag${index} ==highlighted== and **bold** and *italic* text ${sentence(rand)}`;
    default:
      return `${sentence(rand)}`;
  }
}

/** Deterministic synthetic markdown of approximately `targetBytes` bytes. */
export function generateMarkdownDoc(
  targetBytes: number,
  seed = 0x9e3779b9,
): string {
  const rand = mulberry32(seed);
  const parts: string[] = [
    "---\ntitle: Benchmark Note\ntype: note\ntags:\n  - bench\n---\n\n# Benchmark Note\n\n",
  ];
  let bytes = parts[0].length;
  let i = 0;
  while (bytes < targetBytes) {
    const b = block(rand, i);
    parts.push(b);
    bytes += b.length + 1;
    i++;
  }
  return parts.join("\n");
}

// ── Benchmark ────────────────────────────────────────────────────────────

export interface TypingBenchmarkSample {
  /** Target document size in bytes. */
  sizeBytes: number;
  /** Time to install the document (full-doc dispatch), ms. */
  setDocMs: number;
  samples: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface TypingBenchmarkOptions {
  /** Document sizes in bytes. Default: 1KB, 10KB, 100KB. */
  sizes?: number[];
  /** Measured keystrokes per size. Default 200. */
  keystrokes?: number;
  /** Untimed keystrokes per size before measuring. Default 20. */
  warmup?: number;
  seed?: number;
  /**
   * Extension-isolation mode: temporarily swap the view to a fresh state
   * with exactly these extensions (original state restored afterwards).
   * Omit to benchmark the live state as-is.
   */
  extensions?: Extension[];
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx];
}

/**
 * Run the typing benchmark against the live view. Synchronous; restores
 * the original document when done. Sets `editorBenchmarkState.active`
 * for the duration.
 */
export function runTypingBenchmark(
  view: EditorView,
  opts: TypingBenchmarkOptions = {},
): TypingBenchmarkSample[] {
  const sizes = opts.sizes ?? [1024, 10 * 1024, 100 * 1024];
  const keystrokes = opts.keystrokes ?? 200;
  const warmup = opts.warmup ?? 20;
  const seed = opts.seed ?? 0x9e3779b9;

  const originalState = view.state;
  const original = originalState.doc.toString();
  const originalAnchor = originalState.selection.main.anchor;
  const results: TypingBenchmarkSample[] = [];

  editorBenchmarkState.active = true;
  try {
    if (opts.extensions) {
      view.setState(
        EditorState.create({ doc: original, extensions: opts.extensions }),
      );
    }

    for (const size of sizes) {
      const doc = generateMarkdownDoc(size, seed);

      const t0 = performance.now();
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: doc },
      });
      const setDocMs = performance.now() - t0;

      // Type at a fixed anchor 40% into the document — inside the
      // viewport, where decoration plugins do their work.
      const pos = Math.floor(view.state.doc.length * 0.4);
      view.dispatch({ selection: { anchor: pos } });

      for (let i = 0; i < warmup; i++) {
        view.dispatch({ changes: { from: pos, insert: "x" } });
      }

      const samples: number[] = [];
      for (let i = 0; i < keystrokes; i++) {
        const start = performance.now();
        view.dispatch({ changes: { from: pos, insert: "x" } });
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);

      const mean =
        samples.reduce((acc, v) => acc + v, 0) / Math.max(1, samples.length);

      results.push({
        sizeBytes: size,
        setDocMs,
        samples: samples.length,
        meanMs: mean,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
        maxMs: samples[samples.length - 1],
      });
    }
  } finally {
    if (opts.extensions) {
      // Isolation mode: restore the full original state (extensions,
      // undo history, selection) — a doc-only dispatch would leak the
      // subset extension set into the live view.
      view.setState(originalState);
    } else {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: original },
        selection: { anchor: Math.min(originalAnchor, original.length) },
      });
    }
    editorBenchmarkState.active = false;
  }

  return results;
}

// ── Extension isolation mode ─────────────────────────────────────────────

/** One extension subset to measure, e.g. `{ name: "+live-preview", … }`. */
export interface IsolationVariant {
  name: string;
  extensions: Extension[];
}

export interface IsolationBenchmarkSample extends TypingBenchmarkSample {
  variant: string;
}

/**
 * Run the typing benchmark once per extension variant and tag each result
 * with the variant name. The live state is restored after every variant
 * (and again at the end). Compare variants against `base` / `full` to name
 * the per-keystroke culprit instead of guessing.
 */
export function runIsolationBenchmark(
  view: EditorView,
  variants: IsolationVariant[],
  opts: TypingBenchmarkOptions = {},
): IsolationBenchmarkSample[] {
  const originalState = view.state;
  const results: IsolationBenchmarkSample[] = [];
  for (const variant of variants) {
    for (const r of runTypingBenchmark(view, {
      ...opts,
      extensions: variant.extensions,
    })) {
      results.push({ ...r, variant: variant.name });
    }
  }
  view.setState(originalState); // no-op safety net
  return results;
}

// ── Report formatting (devtools-free output) ─────────────────────────────

export type BenchmarkReportRow = TypingBenchmarkSample & {
  variant?: string;
};

/**
 * Format benchmark rows as a markdown table with run metadata — written to
 * a temp file via `write_dev_report` so prod runs need no devtools open.
 */
export function formatBenchmarkReport(
  title: string,
  rows: BenchmarkReportRow[],
): string {
  const hasVariants = rows.some((r) => r.variant !== undefined);
  const header = hasVariants
    ? "| variant | sizeKB | setDoc | mean | p50 | p95 | max | samples |"
    : "| sizeKB | setDoc | mean | p50 | p95 | max | samples |";
  const rule = hasVariants
    ? "|---|---|---|---|---|---|---|---|"
    : "|---|---|---|---|---|---|---|";
  const lines = rows.map((r) =>
    hasVariants
      ? `| ${r.variant} | ${(r.sizeBytes / 1024).toFixed(0)} | ${r.setDocMs.toFixed(1)} | ${r.meanMs.toFixed(2)} | ${r.p50Ms.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.maxMs.toFixed(2)} | ${r.samples} |`
      : `| ${(r.sizeBytes / 1024).toFixed(0)} | ${r.setDocMs.toFixed(1)} | ${r.meanMs.toFixed(2)} | ${r.p50Ms.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.maxMs.toFixed(2)} | ${r.samples} |`,
  );
  return [
    `# ${title}`,
    "",
    `- timestamp: ${new Date().toISOString()}`,
    `- ua: ${navigator.userAgent}`,
    `- frame budget: 16.67ms (p95 column is the number to watch)`,
    "",
    header,
    rule,
    ...lines,
    "",
  ].join("\n");
}
