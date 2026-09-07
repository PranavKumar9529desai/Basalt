// Query parsing + per-node visibility filtering for the graph leaf (ADR-038
// §3 graph split). Pure: given the full-graph arrays and the query, returns
// the subset of full indices passing the tag:/path:/text filter and the
// orphan/attachment display toggles.
export interface FilterTokens {
  tagToks: string[];
  pathToks: string[];
  textToks: string[];
}

export function parseQuery(query: string): FilterTokens {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tagToks: string[] = [];
  const pathToks: string[] = [];
  const textToks: string[] = [];
  for (const t of tokens) {
    if (t.startsWith("tag:")) tagToks.push(t.slice(4));
    else if (t.startsWith("path:")) pathToks.push(t.slice(5));
    else textToks.push(t);
  }
  return { tagToks, pathToks, textToks };
}

export function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

export interface FilterContext {
  paths: string[];
  tags: string[][];
  isTag: boolean[];
  adj: number[][];
  attach: boolean[];
  showOrphans: boolean;
  showAttach: boolean;
}

/** Full indices passing the query filter AND the display toggles. */
export function buildVisible(query: string, ctx: FilterContext): number[] {
  const { tagToks, pathToks, textToks } = parseQuery(query);
  const passFilter = (i: number): boolean => {
    const isTag = ctx.isTag[i];
    if (isTag) {
      // Tags participate only via tag: queries; no active filter shows them.
      if (
        tagToks.length === 0 &&
        pathToks.length === 0 &&
        textToks.length === 0
      )
        return true;
      if (tagToks.length)
        return tagToks.every((tok) => ctx.paths[i].toLowerCase().includes(tok));
      return false;
    }
    const p = ctx.paths[i].toLowerCase();
    const name = basename(p).replace(/\.md$/, "");
    if (pathToks.length && !pathToks.every((tok) => p.includes(tok)))
      return false;
    if (tagToks.length) {
      const ts = ctx.tags[i] ?? [];
      if (
        !tagToks.every((tok) => ts.some((x) => x.toLowerCase().includes(tok)))
      )
        return false;
    }
    if (textToks.length && !textToks.every((tok) => name.includes(tok)))
      return false;
    return true;
  };
  const visible: number[] = [];
  for (let i = 0; i < ctx.paths.length; i++) {
    if (!passFilter(i)) continue;
    if (!ctx.showOrphans && ctx.adj[i].length === 0) continue;
    if (!ctx.showAttach && ctx.attach[i]) continue;
    visible.push(i);
  }
  return visible;
}