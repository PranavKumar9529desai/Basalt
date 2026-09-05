import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import type { EditorView } from "@codemirror/view";

export interface EmbedScanResult {
  from: number;
  to: number;
  target: string;
}

/**
 * Uniformly derive the embed span + normalized target for a `WikiLink` node
 * when it is an embed (`![[target]]`). Returns null when the node isn't an
 * embed (plain `[[Note]]` or no leading `!`). The `!` prefix character is
 * included in `from` so a caller can replace the whole construct. Shared by
 * the live-preview walk (embed chips) and the reading-mode media plugin so
 * their embeds never drift apart.
 */
export function embedTargetFromWikiLink(
  state: EditorState,
  node: SyntaxNodeRef,
): EmbedScanResult | null {
  if (node.name !== "WikiLink") return null;

  const from = node.from;
  const to = node.to;
  if (from < 1 || to < from + 4) return null;
  if (state.doc.sliceString(from - 1, from) !== "!") return null;

  const target = state.doc
    .sliceString(from + 2, to - 2)
    .split("|")[0]
    .split("#")[0]
    .trim();

  if (!target) return null;
  return { from: from - 1, to, target };
}

/**
 * Scan a view's syntax tree for wikilink embeds (`![[target]]`) and yield
 * each as a `{ from, to, target }`. The `!` prefix character is included in
 * the `from` offset so a caller can replace the whole construct.
 */
export function scanEmbedWikiLinks(view: EditorView): EmbedScanResult[] {
  const out: EmbedScanResult[] = [];
  const state = view.state;

  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      const embed = embedTargetFromWikiLink(state, node);
      if (embed) out.push(embed);
    },
  });

  return out;
}

export function classifyMediaExtension(
  ext: string,
): "image" | "audio" | "video" | "pdf" | "other" {
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext))
    return "image";
  if (["mp4", "mov", "avi", "webm", "mkv", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "flac", "ogg", "aac", "m4a", "opus"].includes(ext))
    return "audio";
  if (ext === "pdf") return "pdf";
  return "other";
}

export function extensionOf(target: string): string {
  return target.split(".").pop()?.toLowerCase() ?? "";
}
