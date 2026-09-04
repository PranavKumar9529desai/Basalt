import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
  type PluginValue,
} from "@codemirror/view";
import {
  classifyMediaExtension,
  extensionOf,
  scanEmbedWikiLinks,
} from "./embed-utils";

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
  const kind = classifyMediaExtension(extensionOf(target));
  if (kind === "image") return "🖼";
  if (kind === "video") return "🎬";
  if (kind === "audio") return "🎵";
  if (kind === "pdf") return "📄";
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
    const deco: Array<{ from: number; to: number; value: Decoration }> = [];

    for (const { from, to, target } of scanEmbedWikiLinks(view)) {
      deco.push(
        Decoration.replace({
          widget: new EmbedChipWidget(target),
          inclusive: true,
        }).range(from, to),
      );
    }

    return Decoration.set(deco, true);
  }
}

/** Widget that renders the inline embed chip in live preview. */
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
 * The embed preview extension. Combine with EMBED_THEME in the extension list.
 */
export const embedPreviewPlugin = ViewPlugin.fromClass(EmbedPreviewPlugin, {
  decorations: (v) => v.decorations,
});

/** Export the theme separately so it can be included once. */
export const EMBED_PREVIEW_THEME = EMBED_THEME;
