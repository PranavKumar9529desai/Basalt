import type { SyntaxNodeRef } from "@lezer/common";
import { EditorView, WidgetType } from "@codemirror/view";
import { renderModeFacet } from "./render-mode";
import type { DecorationCollector, DecorationContext } from "./types";
import {
  classifyMediaExtension,
  embedTargetFromWikiLink,
  extensionOf,
} from "../input/embed-utils";
import { buildEmbedWidget } from "../input/embed-media";
import { resolveAssetFacet } from "../types";

/**
 * Live-preview embed handling — `![[target]]` renders as real
 * `<img>/<video>/<audio>` media in every caret state (ADR-034 part C; Obsidian
 * parity — live preview is read-mostly for embeds, raw syntax is edited in
 * source mode). Unresolvable targets keep a compact fallback chip — never a
 * broken media element. Reading mode is left untouched: the reading-mode media
 * plugin (`embed-media.ts`) owns that surface.
 *
 * Fused into live-preview's single tree walk, so it happens in the same
 * decoration pass as every other surface.
 */

/** Class applied to the embed chip element. */
export const EMBED_CHIP_CLASS = "cm-embed-chip";

/** Base theme for the embed chip. */
export const EMBED_PREVIEW_THEME = EditorView.baseTheme({
  [`.${EMBED_CHIP_CLASS}`]: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "1px 6px",
    borderRadius: "4px",
    backgroundColor: "var(--sat-surface-3, #1e293b)",
    color: "var(--sat-text-muted, #94a3b8)",
    fontSize: "0.8em",
    lineHeight: "1.4",
    verticalAlign: "baseline",
    cursor: "pointer",
    whiteSpace: "nowrap",
    maxWidth: "200px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  [`.${EMBED_CHIP_CLASS}:hover`]: {
    backgroundColor: "var(--sat-accent-primary, #3b82f6)",
    color: "var(--sat-text-on-accent, #fff)",
  },
  [`.${EMBED_CHIP_CLASS} .cm-embed-icon`]: {
    fontSize: "1em",
    flexShrink: 0,
  },
});

/** Icon by file type (inferred from extension). */
function embedIcon(target: string): string {
  const kind = classifyMediaExtension(extensionOf(target));
  if (kind === "image") return "🖼";
  if (kind === "video") return "🎬";
  if (kind === "audio") return "🎵";
  if (kind === "pdf") return "📄";
  return "📎";
}

/** Build the widget DOM element for an embed chip. */
function createEmbedChip(target: string): HTMLElement {
  const el = document.createElement("span");
  el.className = EMBED_CHIP_CLASS;
  el.title = target;

  const icon = document.createElement("span");
  icon.className = "cm-embed-icon";
  icon.textContent = embedIcon(target);
  el.appendChild(icon);

  const label = document.createElement("span");
  label.textContent = target.split("/").pop() ?? target;
  el.appendChild(label);

  return el;
}

/** Widget rendering the compact inline embed chip in live preview. */
class EmbedChipWidget extends WidgetType {
  constructor(private readonly target: string) {
    super();
  }

  toDOM(): HTMLElement {
    return createEmbedChip(this.target);
  }

  /** Two widgets are equal if they display the same target. */
  eq(other: EmbedChipWidget): boolean {
    return this.target === other.target;
  }
}

/**
 * Handles a `WikiLink` node that is an embed (`![[target]]`): replaces the
 * whole span with real media in every caret state (ADR-034 part C — live
 * preview is read-mostly for embeds; the raw syntax is edited in source mode,
 * so unlike bullets/HR there is no WYSIWYM reveal for valid media). Unresolved
 * targets keep the chip fallback, and — because a broken embed still needs
 * fixing — the caret reveal remains for them: raw source under the caret,
 * chip off it. Reading mode returns without emitting anything — the
 * reading-mode media plugin owns that span. Returns true when a replace was
 * emitted (or the node was an embed that was intentionally left raw so
 * children aren't double-handled).
 */
export function handleEmbedNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  if (node.type.name !== "WikiLink") return false;

  const embed = embedTargetFromWikiLink(ctx.state, node);
  if (!embed) return false;

  if (ctx.state.facet(renderModeFacet) === "reading") return true;

  const resolveAsset = ctx.state.facet(resolveAssetFacet);
  const url = resolveAsset?.(embed.target);
  if (url) {
    collector.addReplace(embed.from, embed.to, buildEmbedWidget(url, embed.target));
    return true;
  }

  const onActiveLine = ctx.activeLine
    ? embed.from >= ctx.activeLine.from && embed.to <= ctx.activeLine.to
    : false;
  if (onActiveLine) return true;

  collector.addReplace(embed.from, embed.to, new EmbedChipWidget(embed.target));
  return true;
}
