import type { DrawingPayload, ExcalidrawSceneData } from "../types";
import { isObsidianExcalidrawFormat, parseObsidianExcalidraw } from "./obsidianFormat";


/** Fallback canvas background for SSR / tests where document is unavailable. */
const FALLBACK_CANVAS_BG = "#0d0e12";

/**
 * Read the current editor background from the Basalt theme token.
 * Falls back to the volcanic default when document is not available.
 */
export function getEditorBg(): string {
  if (typeof document === "undefined") return FALLBACK_CANVAS_BG;
  return (
    window.getComputedStyle(document.documentElement)
      .getPropertyValue("--sat-surface-1")
      .trim() || FALLBACK_CANVAS_BG
  );
}

/**
 * A static JSON template for unit tests and SSR.
 * Live code should call `makeEmptyDrawingJson()` to pick up the current theme.
 */
export const EMPTY_DRAWING_JSON = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "basalt",
  elements: [],
  appState: {
    viewBackgroundColor: FALLBACK_CANVAS_BG,
    gridSize: 20,
  },
  files: {},
});

/**
 * Create a fresh empty drawing scene whose canvas background matches the
 * currently-active Basalt theme (`--sat-surface-1`).
 */
export function makeEmptyDrawingJson(): string {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "basalt",
    elements: [],
    appState: {
      viewBackgroundColor: getEditorBg(),
      gridSize: 20,
    },
    files: {},
  });
}

/**
 * Extracts non-empty text lines from active (non-deleted) text elements in an Excalidraw JSON payload.
 */
export function extractTextElementsFromJson(dataJson: string): string[] {
  try {
    const parsed = JSON.parse(dataJson) as Partial<ExcalidrawSceneData>;
    if (!parsed || !Array.isArray(parsed.elements)) {
      return [];
    }

    const seen = new Set<string>();
    const result: string[] = [];

    for (const elem of parsed.elements) {
      if (elem.isDeleted) continue;
      if (typeof elem.text === "string") {
        for (const line of elem.text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.length > 0 && !seen.has(trimmed)) {
            seen.add(trimmed);
            result.push(trimmed);
          }
        }
      }
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Parse YAML frontmatter for `created:`/`updated:` timestamps plus the body
 * offset just past the closing frontmatter fence.
 */
function parseFrontmatter(
  content: string,
): { created: string | null; updated: string | null; bodyStart: number } {
  const trimmedStart = content.trimStart();
  if (!trimmedStart.startsWith("---")) {
    return { created: null, updated: null, bodyStart: 0 };
  }

  const afterFirst = content.slice(3);
  const secondFenceIdx = afterFirst.indexOf("\n---");
  if (secondFenceIdx === -1) {
    return { created: null, updated: null, bodyStart: 0 };
  }
  const fmStr = afterFirst.slice(0, secondFenceIdx);

  let created: string | null = null;
  let updated: string | null = null;
  for (const line of fmStr.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("created:")) {
      created = trimmed.replace("created:", "").trim().replace(/^['"]|['"]$/g, "");
    } else if (trimmed.startsWith("updated:")) {
      updated = trimmed.replace("updated:", "").trim().replace(/^['"]|['"]$/g, "");
    }
  }

  let bodyStart = 3 + secondFenceIdx + 4;
  if (bodyStart < content.length && content[bodyStart] === "\n") {
    bodyStart += 1;
  }
  return { created, updated, bodyStart };
}

/**
 * Parse Basalt's native hybrid (`%%#drawing-data` + `# Drawing Text & Elements`).
 */
function parseBasaltHybrid(
  content: string,
  body: string,
): { dataJson: string; textElements: string[] } {
  const basaltTag = content.indexOf("%%#drawing-data");
  let dataJson = EMPTY_DRAWING_JSON;
  if (basaltTag !== -1) {
    const rest = content.slice(basaltTag + "%%#drawing-data".length);
    const endTag = rest.indexOf("%%");
    if (endTag !== -1) {
      const extracted = rest.slice(0, endTag).trim();
      if (extracted.length > 0) {
        dataJson = extracted;
      }
    }
  }

  const textElements: string[] = [];
  let inTextSection = false;
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%%")) {
      break;
    }
    if (trimmed === "# Drawing Text & Elements") {
      inTextSection = true;
      continue;
    }
    if (inTextSection) {
      if (trimmed.startsWith("#")) {
        break;
      }
      if (trimmed.startsWith("-")) {
        const val = trimmed.slice(1).trim();
        if (val.length > 0) {
          textElements.push(val);
        }
      }
    }
  }

  return { dataJson, textElements };
}

/**
 * Parses a drawing file's string content (either hybrid `.drawing.md`, an
 * Obsidian Excalidraw plugin `.excalidraw.md`, or raw `.excalidraw` JSON).
 */
export function parseDrawingContent(content: string): DrawingPayload {
  const trimmedStart = content.trimStart();
  if (trimmedStart.startsWith("{")) {
    // Pure Excalidraw JSON file (.excalidraw)
    return {
      data_json: content,
      text_elements: extractTextElementsFromJson(content),
      raw_markdown: content,
      created: null,
      updated: null,
    };
  }

  const { created, updated, bodyStart } = parseFrontmatter(content);
  const body = bodyStart < content.length ? content.slice(bodyStart) : "";

  // Basalt's native hybrid (.drawing.md): %%#drawing-data + # Drawing Text & Elements.
  if (content.includes("%%#drawing-data") || content.includes("# Drawing Text & Elements")) {
    const parsed = parseBasaltHybrid(content, body);
    const textElements =
      parsed.textElements.length > 0
        ? parsed.textElements
        : extractTextElementsFromJson(parsed.dataJson);
    return {
      data_json: parsed.dataJson,
      text_elements: textElements,
      raw_markdown: content,
      created,
      updated,
    };
  }

  // Obsidian Excalidraw plugin hybrid (.excalidraw.md).
  if (isObsidianExcalidrawFormat(content)) {
    const parsed = parseObsidianExcalidraw(content);
    const dataJson = parsed.dataJson ?? EMPTY_DRAWING_JSON;
    const textElements =
      parsed.textElements.length > 0
        ? parsed.textElements
        : extractTextElementsFromJson(dataJson);
    return {
      data_json: dataJson,
      text_elements: textElements,
      raw_markdown: content,
      created,
      updated,
    };
  }

  return {
    data_json: EMPTY_DRAWING_JSON,
    text_elements: [],
    raw_markdown: content,
    created,
    updated,
  };
}

/**
 * Serializes drawing scene JSON and element texts into the hybrid `.drawing.md` Markdown backplane.
 */
export function serializeDrawingMarkdown(
  dataJson: string,
  existingMarkdown?: string,
): string {
  const textElements = extractTextElementsFromJson(dataJson);
  const nowIso = new Date().toISOString();

  let created = nowIso;
  const customFrontmatterLines: string[] = [];

  if (existingMarkdown) {
    const trimmed = existingMarkdown.trimStart();
    if (trimmed.startsWith("---")) {
      const afterFirst = existingMarkdown.slice(3);
      const secondFenceIdx = afterFirst.indexOf("\n---");
      if (secondFenceIdx !== -1) {
        const fm = afterFirst.slice(0, secondFenceIdx);
        for (const line of fm.split("\n")) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith("created:")) {
            const val = trimmedLine.replace("created:", "").trim().replace(/^['"]|['"]$/g, "");
            if (val.length > 0) {
              created = val;
            }
          } else if (
            !trimmedLine.startsWith("updated:") &&
            !trimmedLine.startsWith("type:") &&
            !trimmedLine.startsWith("version:") &&
            trimmedLine.length > 0
          ) {
            customFrontmatterLines.push(line);
          }
        }
      }
    }
  }

  const lines: string[] = [
    "---",
    "type: excalidraw",
    "version: 2",
    `created: ${created}`,
    `updated: ${nowIso}`,
  ];

  for (const custom of customFrontmatterLines) {
    lines.push(custom);
  }

  lines.push("---");
  lines.push("");
  lines.push("# Drawing Text & Elements");
  lines.push("");

  if (textElements.length > 0) {
    for (const item of textElements) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  } else {
    lines.push("");
  }

  lines.push("%%#drawing-data");
  lines.push(dataJson.trim());
  lines.push("%%");
  lines.push("");

  return lines.join("\n");
}
