// Node/edge color derivation from the `--sat-*` theme tokens (ADR-038 §3
// graph split). `readThemeColors` resolves CSS custom properties once per
// theme change; `colorFor` maps a full-graph node to its drawn RGB triple.
import type { GraphColorMode } from "../components/GraphControls";

export interface ThemeColors {
  note: [number, number, number];
  attachment: [number, number, number];
  tag: [number, number, number][];
  tagFill: [number, number, number];
  edge: [number, number, number];
  label: string;
  hoverFill: [number, number, number];
  hoverRing: [number, number, number];
}

export const FALLBACK_COLORS: ThemeColors = {
  note: [1, 0.416, 0],
  attachment: [0.54, 0.58, 0.6],
  tag: [
    [0.3, 0.76, 1],
    [0.25, 0.73, 0.31],
    [0.82, 0.6, 0.13],
    [0.97, 0.32, 0.29],
    [0.34, 0.65, 1],
    [0.9, 0.93, 0.95],
  ],
  tagFill: [1, 0.416, 0],
  edge: [0.54, 0.58, 0.6],
  label: "#c9d1d9",
  hoverFill: [0.3, 0.76, 1],
  hoverRing: [0.9, 0.93, 0.95],
};

export function readThemeColors(): ThemeColors {
  const tmp = document.createElement("canvas").getContext("2d")!;
  const cs = getComputedStyle(document.documentElement);
  const resolve = (
    name: string,
    fallback: string,
  ): [number, number, number] => {
    tmp.fillStyle = "#000";
    tmp.fillStyle = cs.getPropertyValue(name).trim() || fallback;
    const norm = tmp.fillStyle;
    if (norm.startsWith("#")) {
      const n = parseInt(norm.slice(1), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    const m = norm.match(/[\d.]+/g);
    return m
      ? [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255]
      : [0, 0, 0];
  };
  const resolveCss = (name: string, fallback: string): string => {
    tmp.fillStyle = "#000";
    tmp.fillStyle = cs.getPropertyValue(name).trim() || fallback;
    return tmp.fillStyle;
  };
  return {
    note: resolve("--sat-graph-node", "#ff6a00"),
    attachment: resolve("--sat-graph-attachment", "#8b949e"),
    tag: [
      resolve("--sat-accent-primary", "#4cc2ff"),
      resolve("--sat-state-success", "#3fb950"),
      resolve("--sat-state-warning", "#d29922"),
      resolve("--sat-state-danger", "#f85149"),
      resolve("--sat-state-info", "#58a6ff"),
      resolve("--sat-text-primary", "#e6edf3"),
    ],
    tagFill: resolve("--sat-graph-tag", "#ff6a00"),
    edge: resolve("--sat-graph-edge", "#8b949e"),
    label: resolveCss("--sat-graph-label", "#e6edf3"),
    hoverFill: resolve("--sat-graph-hover-fill", "#4cc2ff"),
    hoverRing: resolve("--sat-graph-hover-ring", "#e6edf3"),
  };
}

export interface ColorContext {
  colors: ThemeColors;
  mode: GraphColorMode;
  isTag: boolean[];
  paths: string[];
  attach: boolean[];
  cluster: Uint32Array;
  clusterCount: number;
  tags: string[][];
}

/** Drawn RGB triple for a full-graph node under the current color mode. */
export function colorFor(full: number, ctx: ColorContext): [number, number, number] {
  const tc = ctx.colors;
  const mode = ctx.mode;
  if (ctx.isTag[full]) {
    // Default ("single") view keeps tags one theme-hued fill; the rainbow
    // palette is opt-in via the cluster/tag/folder color modes below.
    if (mode === "single") return tc.tagFill;
    const p = ctx.paths[full] ?? "";
    let h = 0;
    for (const c of p) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return tc.tag[h % tc.tag.length];
  }
  if (ctx.attach[full]) return tc.attachment;
  if (mode === "single") return tc.note;
  if (mode === "cluster" && ctx.clusterCount > 1) {
    const c = ctx.cluster[full] ?? 0;
    return tc.tag[c % tc.tag.length];
  }
  if (mode === "tag") {
    const ts = ctx.tags[full];
    if (ts && ts.length) {
      let h = 0;
      for (const c of ts[0]) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return tc.tag[h % tc.tag.length];
    }
  }
  if (mode === "folder") {
    const p = ctx.paths[full] ?? "";
    const seg = p.split("/");
    const folder = seg.length > 1 ? seg[0] : "";
    if (folder) {
      let h = 0;
      for (const c of folder) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return tc.tag[h % tc.tag.length];
    }
  }
  return tc.note;
}

/** Drawn RGB triples for every node in a (subset) index map — the shared
 * color-array build used by recolor, rebuild, and renderer resource
 * recreation. */
export function buildColorArray(
  map: number[],
  colorContext: ColorContext,
): Float32Array {
  const cols = new Float32Array(map.length * 3);
  for (let i = 0; i < map.length; i++) {
    const c = colorFor(map[i], colorContext);
    cols[i * 3] = c[0];
    cols[i * 3 + 1] = c[1];
    cols[i * 3 + 2] = c[2];
  }
  return cols;
}