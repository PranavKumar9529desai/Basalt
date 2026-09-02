#!/usr/bin/env bun
/**
 * Size-budget review aid (ADVISORY — not a CI gate).
 *
 * Surfaces files that exceed a soft line budget so a human can judge whether a
 * split is actually warranted. Cohesion / reason-to-change is the real
 * criterion; line count is only a smell signal. This script reports and always
 * exits 0, so it never blocks a build.
 *
 *   - components (.tsx)             -> 200 lines
 *   - hooks (use*.{ts,tsx}, /hooks/)-> 150 lines
 * Stores/services/utils are not line-budgeted here.
 *
 * Run via `bun run check:size`.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TARGET = join(ROOT, "apps/tauri/src");

const BUDGETS = { component: 200, hook: 150 } as const;
type Kind = keyof typeof BUDGETS | "skip";

function classify(relPath: string): Kind {
  const isTsx = relPath.endsWith(".tsx");
  const base = relPath.split("/").pop() ?? "";
  if (base.startsWith("use") || relPath.includes("/hooks/")) return "hook";
  if (isTsx) return "component";
  return "skip";
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && /\.[cm]?[jt]sx?$/.test(e.name)) out.push(full);
  }
  return out;
}

async function main(): Promise<void> {
  const files = await walk(TARGET);
  const violations: {
    file: string;
    lines: number;
    budget: number;
    kind: string;
  }[] = [];

  for (const f of files) {
    const rel = relative(ROOT, f);
    const kind = classify(rel);
    if (kind === "skip") continue;
    const src = await readFile(f, "utf8");
    const lines = src.endsWith("\n")
      ? src.split("\n").length - 1
      : src.split("\n").length;
    const budget = BUDGETS[kind as keyof typeof BUDGETS];
    if (lines > budget) violations.push({ file: rel, lines, budget, kind });
  }

  if (violations.length === 0) {
    console.log("✓ All files within size budgets (advisory).");
    process.exit(0);
  }
  console.warn(
    `⚠ ${violations.length} file(s) exceed size budget — review for cohesion, not a hard gate:\n`,
  );
  for (const v of [...violations].sort((a, b) => b.lines - a.lines)) {
    console.warn(
      `  ${String(v.lines).padStart(4)} > ${v.budget} (${v.kind})  ${v.file}`,
    );
  }
  process.exit(0);
}

main();
