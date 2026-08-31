/**
 * Search modal benchmark — the frontend counterpart of the criterion
 * `basalt-search` benches (the Rust benches prove the raw index is fast; this
 * proves the React modal is fast at shipping those results to pixels).
 *
 * Drives the REAL SearchModal composition through `useSearchStore` with
 * deterministic synthetic result sets, measuring two things per interaction:
 *   - `commit` — React render + commit only (flushSync), no effects.
 *     The modal's own main-thread cost, comparable to the editor's dispatch.
 *   - `paint` — from state update until the next painted frame after passive
 *     effects drain. This captures the PreviewPane CM6 re-parse + decoration
 *     work that `commit` cannot see (it runs in useEffect, post-commit).
 *
 * p95 of `paint` is the number to watch against the 16.67ms frame budget.
 *
 * Safety: bypasses `runSearch` entirely (no invoke, no Rust side effects) and
 * restores the store to a clean closed state when done. Runs on the live
 * modal — the dialog briefly shows synthetic results during a run, same as
 * the editor benchmark briefly swaps in a synthetic document.
 */
import { flushSync } from "react-dom";
import { useSearchStore } from "./store";
import type { FileMatch, Highlight, LineMatch } from "./types";

// Deterministic synthetic data (mulberry32 — same PRNG as the editor harness)
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
  "latency",
  "search",
  "result",
  "index",
  "query",
  "preview",
  "virtual",
  "render",
  "highlight",
  "benchmark",
  "vault",
  "note",
  "criterion",
  "snippet",
  "match",
];

function sentence(rand: () => number): string {
  const n = 8 + Math.floor(rand() * 10);
  const words: string[] = [];
  for (let i = 0; i < n; i++)
    words.push(WORDS[Math.floor(rand() * WORDS.length)]);
  const s = words.join(" ");
  return `${s.charAt(0).toUpperCase() + s.slice(1)}.`;
}

function block(rand: () => number, index: number): string {
  const kind = index % 6;
  switch (kind) {
    case 0:
      return `## Heading ${index} — ${sentence(rand)}`;
    case 1:
      return `${sentence(rand)} ${sentence(rand)} [[wikilink ${index}]] ${sentence(rand)}`;
    case 2:
      return `- item ${index}a ${sentence(rand)}\n- item ${index}b [[note]]\n- item ${index}c`;
    case 3:
      return `> [!tip] Callout ${index}\n> ${sentence(rand)}`;
    case 4:
      return `\`\`\`ts
const value_${index}: number = ${index};
export default value_${index};
\`\`\``;
    default:
      return `${sentence(rand)}`;
  }
}

function genMarkdown(seed: number, targetBytes: number): string {
  const rand = mulberry32(seed);
  const parts = [
    "---\ntitle: Benchmark Note\ntags:\n  - bench\n---\n\n# Benchmark Note\n\n",
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

/** One or two <mark> spans per line, mirroring a real query's snippets. */
function makeHighlights(line: string): Highlight[] {
  const spans: Highlight[] = [];
  const push = (start: number, end: number) => {
    if (start < end && end <= line.length)
      spans.push({ start, end });
  };
  let from = 0;
  while (true) {
    const i = line.toLowerCase().indexOf("performance", from);
    if (i === -1) break;
    push(i, i + 11);
    from = i + 1;
    if (spans.length >= 2) break;
  }
  const j = line.toLowerCase().indexOf("latency");
  if (j !== -1 && spans.length < 2) push(j, j + 7);
  if (spans.length === 0) push(0, Math.min(8, line.length));
  return spans.sort((a, b) => a.start - b.start);
}

interface TierSpec {
  name: string;
  files: number;
  matchesPerFile: number;
  bytes: number;
}

const DEFAULT_TIERS: TierSpec[] = [
  { name: "4KB", files: 20, matchesPerFile: 16, bytes: 4 * 1024 },
  { name: "40KB", files: 20, matchesPerFile: 16, bytes: 40 * 1024 },
  { name: "100KB", files: 20, matchesPerFile: 16, bytes: 100 * 1024 },
];

const BASE_SEED = 0x9e3779b9;

function buildResults(spec: TierSpec): FileMatch[] {
  const files: FileMatch[] = [];
  for (let f = 0; f < spec.files; f++) {
    const rand = mulberry32(BASE_SEED + f * 17);
    const text = genMarkdown(BASE_SEED + f * 31, spec.bytes);
    const lines = text.split("\n");
    const matches: LineMatch[] = [];
    const step = Math.max(1, Math.floor(lines.length / spec.matchesPerFile));
    for (let m = 0; m < spec.matchesPerFile; m++) {
      const floor = Math.min(lines.length - 1, m * step);
      const li = Math.min(lines.length - 1, floor + Math.floor(rand() * step));
      const line = lines[li];
      const lineNumber = li + 1;
      const ctx = (off: number) => {
        const j = li + off;
        if (j < 0 || j >= lines.length) return [];
        return [{ lineNumber: j + 1, text: lines[j] }];
      };
      matches.push({
        lineNumber,
        text: line,
        highlights: makeHighlights(line),
        contextBefore: ctx(-1),
        contextAfter: ctx(1),
      });
    }
    files.push({
      path: `bench/${String(f).padStart(3, "0")}.md`,
      title: `Benchmark Note ${spec.name} ${f}`,
      score: 1 - f / spec.files,
      matches,
    });
  }
  return files;
}

/** One frame of the browser's paint cadence. */
function frame(): Promise<void> {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Allow React's post-commit passive-effects drain (PreviewPane) plus a paint
 * to complete before the next measured step, without counting that time.
 */
function settle(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }, 0);
  });
}

interface StepResult {
  commit: number;
  paint: number;
}

/**
 * Run `fn` (a store mutation) and time it two ways: commit = synchronous
 * React render+commit; paint = until a frame paints after passive effects.
 */
async function step(fn: () => void): Promise<StepResult> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await frame();
  const t0 = performance.now();
  flushSync(fn);
  const commit = performance.now() - t0;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await frame();
  return { commit, paint: performance.now() - t0 };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx];
}

export interface SearchBenchmarkSample {
  tier: string;
  phase: string;
  samples: number;
  commitP50Ms: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface SearchBenchmarkOptions {
  tiers?: TierSpec[];
  warmup?: number;
  reps?: number;
}

const QUERY = "performance latency";
const TYPE_PREFIXES = [
  "p",
  "pe",
  "per",
  "perf",
  "perfo",
  "perfor",
  "perform",
  "performa",
  "performance",
];

function collectStats(commits: number[], paints: number[]) {
  const sortedP = [...paints].sort((a, b) => a - b);
  const sortedC = [...commits].sort((a, b) => a - b);
  const mean =
    paints.reduce((acc, v) => acc + v, 0) / Math.max(1, paints.length);
  return {
    commitP50Ms: percentile(sortedC, 0.5),
    meanMs: mean,
    p50Ms: percentile(sortedP, 0.5),
    p95Ms: percentile(sortedP, 0.95),
    maxMs: sortedP[sortedP.length - 1],
  };
}

/**
 * Run the search-modal benchmark against the live app. Opens the modal,
 * injects synthetic results at each tier, and measures each interaction
 * phase. Restores a clean closed state when done.
 */
export async function runSearchBenchmark(
  opts: SearchBenchmarkOptions = {},
): Promise<SearchBenchmarkSample[]> {
  const tiers = opts.tiers ?? DEFAULT_TIERS;
  const reps = opts.reps ?? 20;
  const warmup = opts.warmup ?? 6;

  const samples: SearchBenchmarkSample[] = [];

  const run = async (
    phase: string,
    tierName: string,
    makeStep: (i: number) => () => void,
  ): Promise<void> => {
    for (let i = 0; i < warmup; i++) {
      await step(makeStep(i));
    }
    const commits: number[] = [];
    const paints: number[] = [];
    for (let i = 0; i < reps; i++) {
      const r = await step(makeStep(i));
      commits.push(r.commit);
      paints.push(r.paint);
    }
    samples.push({
      tier: tierName,
      phase,
      samples: reps,
      ...collectStats(commits, paints),
    });
  };

  try {
    for (const tier of tiers) {
      const files = buildResults(tier);
      const totalHits = files.length * tier.matchesPerFile;
      const m = tier.matchesPerFile;

      // open-cold: dialog fully remounts per rep (close + reopen), then the
      // first result set is installed in the same commit as the open.
      const openCommits: number[] = [];
      const openPaints: number[] = [];
      const collectOpen = async () => {
        useSearchStore.getState().closeSearch();
        await settle();
        const r = await step(() => {
          useSearchStore.setState({
            isSearchOpen: true,
            searchQuery: QUERY,
            searchResults: files,
            searchTotalHits: totalHits,
            searchSelectedIndex: 0,
            isSearchLoading: false,
          });
        });
        openCommits.push(r.commit);
        openPaints.push(r.paint);
        await settle();
      };
      for (let i = 0; i < warmup; i++) await collectOpen();
      for (let i = 0; i < reps; i++) await collectOpen();
      samples.push({
        tier: tier.name,
        phase: "open-cold",
        samples: reps,
        ...collectStats(openCommits, openPaints),
      });

      // Remaining phases: modal is now open with data in place.
      await run(
        "install",
        tier.name,
        (i) => () =>
          useSearchStore.setState({
            searchResults: i % 2 === 0 ? files : files.map((f) => ({ ...f })),
          }),
      );

      await run("nav-same-file", tier.name, (i) => () => {
        const gi = i % 2 === 0 ? 3 : m - 5;
        useSearchStore.setState({ searchSelectedIndex: gi });
      });

      await run("nav-cross-file", tier.name, (i) => () => {
        const gi = i % 2 === 0 ? m - 1 : m;
        useSearchStore.setState({ searchSelectedIndex: gi });
      });

      await run("keystroke", tier.name, (i) => () => {
        useSearchStore.setState({
          searchQuery: TYPE_PREFIXES[i % TYPE_PREFIXES.length],
        });
      });
    }
  } finally {
    useSearchStore.setState({
      isSearchOpen: false,
      searchQuery: "",
      searchResults: [],
      searchTotalHits: 0,
      searchSelectedIndex: 0,
      isSearchLoading: false,
    });
  }

  return samples;
}

/**
 * Format benchmark rows as a markdown table with run metadata — written to
 * a temp file via `write_dev_report` so prod runs need no devtools open.
 */
export function formatSearchBenchmarkReport(
  rows: SearchBenchmarkSample[],
): string {
  const header = "| tier | phase | n | commitP50 | mean | p50 | p95 | max |";
  const rule = "|---|---|---|---|---|---|---|---|";
  const lines = rows.map(
    (r) =>
      `| ${r.tier} | ${r.phase} | ${r.samples} | ${r.commitP50Ms.toFixed(2)} | ${r.meanMs.toFixed(2)} | ${r.p50Ms.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.maxMs.toFixed(2)} |`,
  );
  return [
    "# Search Modal Benchmark",
    "",
    `- timestamp: ${new Date().toISOString()}`,
    `- ua: ${navigator.userAgent}`,
    "- frame budget: 16.67ms — p95 (paint) is the number to watch",
    "- paint = state update until next painted frame, incl. PreviewPane CM6 re-parse (useEffect)",
    "- commitP50 = React render+commit only (flushSync), pre-effects",
    "",
    header,
    rule,
    ...lines,
    "",
  ].join("\n");
}
