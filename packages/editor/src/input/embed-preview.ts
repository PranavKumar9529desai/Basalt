import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  type PluginValue,
  type DecorationRange,
} from "@codemirror/view";

/**
 * CM6 extension that renders `![[...]]` embeds as compact placeholder chips
 * in live preview mode. The chip shows the filename (and an icon by type)
 * without breaking the editing flow — the decoration sits inline and
 * the raw syntax remains accessible for editing.
 *
 * Reading-mode rendering (actual `<img>` tags) is a separate concern
 * handled by the reading-mode renderer (ADR-024).
 */

/** Class applied to the embed chip element. */
const EMBED_CHIP_CLASS = "cm-embed-chip";

/** Base theme for the embed chip. */
const EMBED_THEME = EditorView.baseTheme({
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
  const ext = target.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "🖼";
  if (["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) return "🎬";
  if (["mp3", "wav", "flac", "ogg", "aac", "m4a"].includes(ext)) return "🎵";
  if (["pdf"].includes(ext)) return "📄";
  return "📎";
}

/**
 * Build the widget DOM element for an embed chip.
 */
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

class EmbedPreviewPlugin implements PluginValue {
  decorations: DecorationSet = Decoration.none;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const deco: DecorationRange[] = [];
    const tree = syntaxTree(view.state);
    const doc = view.state.doc;

    // Scan all WikiLink nodes and check if preceded by '!'
    tree.iterate({
      enter(node) {
        if (node.name !== "WikiLink") return;

        const from = node.from;
        const to = node.to;

        // Check character immediately before the WikiLink's [[.
        // The WikiLink node includes the [[ and ]], so from points at [.
        if (from < 1) return;
        const charBefore = doc.sliceString(from - 1, from);
        if (charBefore !== "!") return;

        // Extract the target: text between [[ and ]]
        const target = doc.sliceString(from + 2, to - 2)
          .split("|")[0]   // strip alias
          .split("#")[0]   // strip anchor
          .trim();

        if (!target) return;

        // Replace the entire `![[target]]` with the chip widget.
        // The widget spans from the `!` to the closing `]]`.
        deco.push(
          Decoration.replace({
            widget: createWidget(target),
            inclusive: true,
          }).range(from - 1, to),
        );
      },
    });

    return Decoration.set(deco, true);
  }
}

function createWidget(target: string) {
  return {
    toDOM() {
      return createEmbedChip(target);
    },
    // Widget participates in text flow.
    bypassFocus: true,
  };
}

/**
 * The embed preview extension. Combine with EMBED_THEME in the extension list.
 */
export const embedPreviewPlugin = ViewPlugin.fromClass(EmbedPreviewPlugin, {
  decorations: (v) => v.decorations,
});

/** Export the theme separately so it can be included once. */
export const EMBED_PREVIEW_THEME = EMBED_THEME;
