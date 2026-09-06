import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
  type PluginValue,
} from "@codemirror/view";
import { resolveAssetFacet } from "../types";
import { classifyMediaExtension, extensionOf, scanEmbedWikiLinks } from "./embed-utils";
import { isEmbedInRawMode, setEmbedRawMode } from "./embed-state";
import { notifyViewOfSizeChange } from "../block-widgets/utils";

const EMBED_MEDIA_CLASS = "cm-embed-media";

const EMBED_MEDIA_THEME = EditorView.baseTheme({
  [`.${EMBED_MEDIA_CLASS}`]: {
    display: "block",
    margin: "0.75em 0",
    position: "relative",
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
  ".cm-embed-btn-code": {
    position: "absolute",
    top: "6px",
    right: "6px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    borderRadius: "var(--sat-layout-radius-sm, 4px)",
    background: "var(--sat-surface-2, rgba(0, 0, 0, 0.4))",
    border: "1px solid var(--sat-layout-border, rgba(255, 255, 255, 0.1))",
    color: "var(--sat-text-muted, #94a3b8)",
    cursor: "pointer",
    opacity: "0.6",
    transition: "opacity 0.15s ease, background 0.15s ease, color 0.15s ease",
    zIndex: "10",
  },
  [`.${EMBED_MEDIA_CLASS}:hover .cm-embed-btn-code`]: {
    opacity: "1",
  },
  ".cm-embed-btn-code:hover": {
    background: "var(--sat-surface-3, rgba(255, 255, 255, 0.15))",
    color: "var(--sat-text-primary, #ffffff)",
  },
});

function mediaKind(target: string): "image" | "audio" | "video" | "pdf" {
  const kind = classifyMediaExtension(extensionOf(target));
  if (kind === "other") return "image";
  return kind;
}

export class EmbedMediaWidget extends WidgetType {
  constructor(
    private readonly url: string,
    private readonly target: string,
    private readonly from?: number,
    private readonly to?: number,
  ) {
    super();
  }

  eq(other: EmbedMediaWidget): boolean {
    return (
      this.url === other.url &&
      this.target === other.target &&
      this.from === other.from &&
      this.to === other.to
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = EMBED_MEDIA_CLASS;

    if (this.from !== undefined && this.to !== undefined) {
      const codeBtn = document.createElement("button");
      codeBtn.className = "cm-embed-btn-code";
      codeBtn.setAttribute("type", "button");
      codeBtn.title = "Edit as raw Markdown";
      codeBtn.setAttribute("aria-label", "Edit as raw Markdown");
      codeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
      codeBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const from = this.from!;
        const to = this.to!;
        view.dispatch({
          effects: setEmbedRawMode.of({ from, to }),
          selection: { anchor: from },
        });
        view.focus();
      });
      wrapper.appendChild(codeBtn);
    }

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
        el.onload = () => notifyViewOfSizeChange(wrapper, view);
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

/**
 * Build the real-media widget for a resolved embed. Shared by the reading-mode
 * plugin (below) and the live-preview walk (`preview/embeds.ts`) so both
 * surfaces render the same media element for the same `![[target]]` (ADR-034).
 */
export function buildEmbedWidget(
  url: string,
  target: string,
  from?: number,
  to?: number,
): WidgetType {
  return new EmbedMediaWidget(url, target, from, to);
}

class EmbedMediaPlugin implements PluginValue {
  decorations: DecorationSet = Decoration.none;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const resolveAsset = view.state.facet(resolveAssetFacet);
    if (!resolveAsset) return Decoration.none;

    const deco: Array<{ from: number; to: number; value: Decoration }> = [];

    for (const { from, to, target } of scanEmbedWikiLinks(view)) {
      if (isEmbedInRawMode(view.state, from, to)) continue;
      const url = resolveAsset(target);
      if (!url) {
        const fallback = document.createElement("span");
        fallback.className = "cm-embed-fallback";
        fallback.textContent = `⚠ ${target}`;
        deco.push(
          Decoration.replace({
            widget: new (class extends WidgetType {
              toDOM() {
                return fallback;
              }
              eq() {
                return true;
              }
              ignoreEvent() {
                return true;
              }
            })(),
            inclusive: true,
          }).range(from, to),
        );
        continue;
      }

      deco.push(
        Decoration.replace({
          widget: new EmbedMediaWidget(url, target, from, to),
          inclusive: true,
        }).range(from, to),
      );
    }

    return Decoration.set(deco, true);
  }
}

/** Reading-mode embed plugin — resolves `![[file]]` to actual media.
 * Requires `resolveAssetFacet` to be provided. */
export const embedMediaPlugin = ViewPlugin.fromClass(EmbedMediaPlugin, {
  decorations: (v) => v.decorations,
});

export { EMBED_MEDIA_THEME };
