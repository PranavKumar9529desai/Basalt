import { readingExtensions } from "@workspace/editor";
import type { PreviewDeps } from "../../search/types";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { ExportOptions } from "../types";

const PAGE_SIZES: Record<string, { width: string; height: string }> = {
  A4: { width: "210mm", height: "297mm" },
  Letter: { width: "8.5in", height: "11in" },
  Legal: { width: "8.5in", height: "14in" },
};

function buildPrintStyles(options: ExportOptions): string {
  const page = PAGE_SIZES[options.pageSize] ?? PAGE_SIZES.A4;
  const isLandscape = options.orientation === "landscape";
  const w = isLandscape ? page.height : page.width;
  const h = isLandscape ? page.width : page.height;

  const themeReset = options.includeTheme
    ? ""
    : `
    * {
      color: #000 !important;
      background: #fff !important;
      border-color: #ccc !important;
      box-shadow: none !important;
    }
    .cm-editor {
      background: #fff !important;
    }
    .cm-editor * {
      color: #000 !important;
      background: transparent !important;
    }
  `;

  return `
    @page {
      size: ${w} ${h};
      margin: 20mm 18mm 25mm 18mm;
    }
    @media print {
      body * {
        visibility: hidden;
      }
      #export-preview-container,
      #export-preview-container * {
        visibility: visible !important;
      }
      #export-preview-container {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
      }
      ${themeReset}
    }
    #export-preview-container {
      visibility: hidden;
      font-family: var(--sat-font-prose, "Inter", -apple-system, sans-serif);
      font-size: ${options.fontSize}px;
      line-height: 1.7;
      color: var(--sat-text-primary, #1a1a1a);
      max-width: 100%;
      padding: 0;
    }
    #export-preview-container .cm-editor {
      background: transparent;
      height: auto !important;
      overflow: visible !important;
    }
    #export-preview-container .cm-scroller {
      overflow: visible !important;
      height: auto !important;
      font-family: inherit;
      line-height: inherit;
    }
    #export-preview-container .cm-content {
      padding: 0 !important;
      font-family: inherit;
    }
    #export-preview-container .cm-gutters {
      display: none !important;
    }
    #export-preview-container .cm-line {
      padding: 0;
    }
    #export-preview-container .cm-focused {
      outline: none !important;
    }
  `;
}

export async function renderAndPrint(
  markdown: string,
  noteName: string,
  options: ExportOptions,
  deps: PreviewDeps,
): Promise<void> {
  const container = document.createElement("div");
  container.id = "export-preview-container";

  const style = document.createElement("style");
  style.textContent = buildPrintStyles(options);
  document.head.appendChild(style);
  document.body.appendChild(container);

  try {
    const state = EditorState.create({
      doc: markdown,
      extensions: [
        readingExtensions(deps),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.theme({
          "&": { height: "auto", backgroundColor: "transparent" },
          ".cm-content": { padding: "0", caretColor: "transparent" },
          ".cm-scroller": {
            overflow: "visible",
            fontFamily: "inherit",
          },
          ".cm-gutters": { display: "none" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });

    // Wait for block widgets (DQL, embeds, etc.) to render
    await new Promise((r) => setTimeout(r, 500));

    document.title = noteName;
    window.print();
    view.destroy();
  } finally {
    container.remove();
    style.remove();
  }
}
