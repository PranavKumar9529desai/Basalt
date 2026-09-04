import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";

export interface EmbedScanResult {
  from: number;
  to: number;
  target: string;
}

/**
 * Scan a view's syntax tree for wikilink embeds (`![[target]]`) and yield
 * each as a `{ from, to, target }`. The `!` prefix character is included in
 * the `from` offset so a caller can replace the whole construct.
 */
export function scanEmbedWikiLinks(view: EditorView): EmbedScanResult[] {
  const out: EmbedScanResult[] = [];
  const tree = syntaxTree(view.state);
  const doc = view.state.doc;

  tree.iterate({
    enter(node) {
      if (node.name !== "WikiLink") return;

      const from = node.from;
      const to = node.to;
      if (from < 1) return;
      if (doc.sliceString(from - 1, from) !== "!") return;

      const target = doc
        .sliceString(from + 2, to - 2)
        .split("|")[0]
        .split("#")[0]
        .trim();

      if (!target) return;
      out.push({ from: from - 1, to, target });
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
