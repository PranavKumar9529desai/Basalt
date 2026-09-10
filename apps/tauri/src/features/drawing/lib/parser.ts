import type { DrawingPayload, ExcalidrawSceneData } from "../types";

export const EMPTY_DRAWING_JSON = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "basalt",
  elements: [],
  appState: {
    viewBackgroundColor: "#121110",
    gridSize: 20,
  },
  files: {},
});

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
 * Parses a drawing file's string content (either hybrid `.drawing.md` or raw `.excalidraw` JSON).
 */
export function parseDrawingContent(content: string): DrawingPayload {
  const trimmedStart = content.trimStart();
  if (trimmedStart.startsWith("{")) {
    return {
      data_json: content,
      text_elements: extractTextElementsFromJson(content),
      raw_markdown: content,
      created: null,
      updated: null,
    };
  }

  let created: string | null = null;
  let updated: string | null = null;
  let bodyStart = 0;

  if (trimmedStart.startsWith("---")) {
    const afterFirst = content.slice(3);
    const secondFenceIdx = afterFirst.indexOf("\n---");
    if (secondFenceIdx !== -1) {
      const fmStr = afterFirst.slice(0, secondFenceIdx);
      bodyStart = 3 + secondFenceIdx + 4;
      if (bodyStart < content.length && content[bodyStart] === "\n") {
        bodyStart += 1;
      }

      for (const line of fmStr.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("created:")) {
          created = trimmed.replace("created:", "").trim().replace(/^['"]|['"]$/g, "");
        } else if (trimmed.startsWith("updated:")) {
          updated = trimmed.replace("updated:", "").trim().replace(/^['"]|['"]$/g, "");
        }
      }
    }
  }

  const body = bodyStart < content.length ? content.slice(bodyStart) : "";

  // Extract %%#drawing-data ... %%
  let dataJson = EMPTY_DRAWING_JSON;
  const startTag = content.indexOf("%%#drawing-data");
  if (startTag !== -1) {
    const jsonStart = startTag + "%%#drawing-data".length;
    const rest = content.slice(jsonStart);
    const endTag = rest.indexOf("%%");
    if (endTag !== -1) {
      const extracted = rest.slice(0, endTag).trim();
      if (extracted.length > 0) {
        dataJson = extracted;
      }
    }
  }

  // Extract text elements from markdown body
  let textElements: string[] = [];
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

  if (textElements.length === 0) {
    textElements = extractTextElementsFromJson(dataJson);
  }

  return {
    data_json: dataJson,
    text_elements: textElements,
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
