// ---------------------------------------------------------------------------
// HTML rendering helpers
// ---------------------------------------------------------------------------

import { classifyMediaExtension, extensionOf } from "../input/embed-utils";
import { escapeHtml } from "./utils";

export type ResolveAssetFn = (target: string) => string | null;

/**
 * Decode the three entities `escapeHtml` produces so an embed target captured
 * from already-escaped cell text can be passed to `resolveAsset` verbatim.
 */
function htmlDecode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Real media element for a resolvable `![[target]]` embed (ADR-034 part B). */
function embedMediaHtml(
  kind: "image" | "video" | "audio",
  url: string,
  name: string,
): string {
  const attrs =
    ' class="cm-table-link cm-table-media" data-name="' +
    escapeHtml(name) +
    '"';
  switch (kind) {
    case "image":
      return `<img${attrs} src="${escapeHtml(url)}" alt="${escapeHtml(
        name,
      )}" loading="lazy">`;
    case "video":
      return `<video${attrs} src="${escapeHtml(
        url,
      )}" controls preload="metadata"></video>`;
    case "audio":
      return `<audio${attrs} src="${escapeHtml(url)}" controls></audio>`;
  }
}

/** Highlighted table-cell link carrying the resolved target for clicks. */
function tableLinkHtml(target: string, display: string): string {
  return `<span class="cm-table-link" data-name="${escapeHtml(
    target,
  )}">${display}</span>`;
}

/**
 * Render inline markdown: `[[wikilinks]]` (optionally `!`-prefixed media
 * embeds), **bold**, *italic*, `code`. `resolve` resolves an embed target to a
 * loadable URL; aliased links and unresolvable/non-media targets stay links.
 */
export function renderInlineCell(
  text: string,
  resolve: ResolveAssetFn | undefined,
): string {
  let result = escapeHtml(text);
  if (!result.includes("[") && !result.includes("*") && !result.includes("`")) {
    return result;
  }

  if (result.includes("[[")) {
    result = result.replace(
      /(!?)\[\[([^\]]+)\]\]/g,
      (_m, bang: string, inner: string) => {
        const [target, alias] = inner.split("|");
        const cleanTarget = target.split("#")[0].trim();
        const display = alias?.trim() || cleanTarget;

        if (bang && !alias && resolve) {
          const url = resolve(htmlDecode(cleanTarget));
          if (url) {
            const kind = classifyMediaExtension(extensionOf(cleanTarget));
            if (kind === "image" || kind === "video" || kind === "audio") {
              return embedMediaHtml(kind, url, cleanTarget);
            }
          }
        }
        return tableLinkHtml(cleanTarget, display);
      },
    );
  }

  // **bold**
  if (result.includes("**")) {
    result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }
  // *italic*
  if (result.includes("*")) {
    result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }
  // `code`
  if (result.includes("`")) {
    result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  return result;
}
