import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
  type PluginValue,
} from "@codemirror/view";
import { resolveAssetFacet } from "../editor";

const EMBED_MEDIA_CLASS = "cm-embed-media";

const EMBED_MEDIA_THEME = EditorView.baseTheme({
  [`.${EMBED_MEDIA_CLASS}`]: {
    display: "block",
    margin: "0.75em 0",
  },
  [`.${EMBED_MEDIA_CLASS} img`]: {
    display: "block",
    maxWidth: "100%",
    maxHeight: "70vh",
    objectFit: "contain",
    borderRadius: "var(--sat-layout-radius-md, 8px)",
    border: "1px solid var(--sat-layout-border)",
  },
  [`.${EMBED_MEDIA_CLASS} audio`]: {
    display: "block",
    width: "100%",
  },
  [`.${EMBED_MEDIA_CLASS} video`]: {
    display: "block",
    maxWidth: "100%",
    maxHeight: "70vh",
    borderRadius: "var(--sat-layout-radius-md, 8px)",
    border: "1px solid var(--sat-layout-border)",
  },
  [`.${EMBED_MEDIA_CLASS} iframe`]: {
    display: "block",
    width: "100%",
    height: "70vh",
    border: "1px solid var(--sat-layout-border)",
    borderRadius: "var(--sat-layout-radius-md, 8px)",
  },
  [`.${EMBED_MEDIA_CLASS} .cm-embed-fallback`]: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "4px",
    backgroundColor: "var(--sat-surface-2)",
    color: "var(--sat-text-muted)",
    fontSize: "0.85em",
  },
});

function mediaKind(target: string): "image" | "audio" | "video" | "pdf" {
  const ext = target.split(".")?.pop()?.toLowerCase() ?? "";
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a", "opus"].includes(ext))
    return "audio";
  if (["mp4", "webm", "mov", "mkv", "avi", "m4v"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "image";
}

class EmbedMediaWidget extends WidgetType {
  constructor(
    private readonly url: string,
    private readonly target: string,
  ) {
    super();
  }

  eq(other: EmbedMediaWidget): boolean {
    return this.url === other.url && this.target === other.target;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = EMBED_MEDIA_CLASS;

    const kind = mediaKind(this.target);
    switch (kind) {
      case "audio": {
        const el = document.createElement("audio");
        el.controls = true;
        el.src = this.url;
        wrapper.appendChild(el);
        break;
      }
      case "video": {
        const el = document.createElement("video");
        el.controls = true;
        el.src = this.url;
        wrapper.appendChild(el);
        break;
      }
      case "pdf": {
        const el = document.createElement("iframe");
        el.src = this.url;
        el.title = this.target;
        wrapper.appendChild(el);
        break;
      }
      default: {
        const el = document.createElement("img");
        el.src = this.url;
        el.alt = this.target;
        el.loading = "lazy";
        wrapper.appendChild(el);
        break;
      }
    }

    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class EmbedMediaPlugin implements PluginValue {
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
    const resolveAsset = view.state.facet(resolveAssetFacet);
    if (!resolveAsset) return Decoration.none;

    const deco: Array<{ from: number; to: number; value: Decoration }> = [];
    const tree = syntaxTree(view.state);
    const doc = view.state.doc;

    tree.iterate({
      enter(node) {
        if (node.name !== "WikiLink") return;

        const from = node.from;
        const to = node.to;
        if (from < 1) return;
        const charBefore = doc.sliceString(from - 1, from);
        if (charBefore !== "!") return;

        const target = doc
          .sliceString(from + 2, to - 2)
          .split("|")[0]
          .split("#")[0]
          .trim();

        if (!target) return;

        const url = resolveAsset(target);
        if (!url) {
          const fallback = document.createElement("span");
          fallback.className = "cm-embed-fallback";
          fallback.textContent = `⚠ ${target}`;
          deco.push(
            Decoration.replace({
              widget: new class extends WidgetType {
                toDOM() {
                  return fallback;
                }
                eq() {
                  return true;
                }
                ignoreEvent() {
                  return true;
                }
              }(),
              inclusive: true,
            }).range(from - 1, to),
          );
          return;
        }

        deco.push(
          Decoration.replace({
            widget: new EmbedMediaWidget(url, target),
            inclusive: true,
          }).range(from - 1, to),
        );
      },
    });

    return Decoration.set(deco, true);
  }
}

/** Reading-mode embed plugin — resolves `![[file]]` to actual media.
 * Requires `resolveAssetFacet` to be provided. */
export const embedMediaPlugin = ViewPlugin.fromClass(EmbedMediaPlugin, {
  decorations: (v) => v.decorations,
});

export { EMBED_MEDIA_THEME };
