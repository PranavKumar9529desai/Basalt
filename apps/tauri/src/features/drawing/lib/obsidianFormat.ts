/**
 * Obsidian Excalidraw plugin compatibility (`.excalidraw.md`).
 *
 * The plugin persists hybrid markdown: `# Excalidraw Data` with a `## Text
 * Elements` bullet section, `## Element Links`, `## Embedded Files`, and a
 * fenced `## Drawing` scene block whose body is either raw `json` or
 * LZString `compressed-json` (base64, chunked into 256-char lines).
 *
 * Mirrors `src-tauri/src/core/drawing/obsidian.rs` — keep in sync.
 */
import { decompressFromBase64 } from "lz-string";

export interface ParsedObsidianDrawing {
  /** Scene JSON (raw or decompressed). `null` when no parseable scene exists. */
  dataJson: string | null;
  /** Plain-text lines from the `## Text Elements` section (block refs stripped). */
  textElements: string[];
}

/** Byte span `(start, end)` of the `# Drawing`/`## Drawing` heading line. */
function drawingHeadingSpan(content: string): [number, number] | null {
  let offset = 0;
  for (const line of content.split("\n")) {
    if (line.trim() === "# Drawing" || line.trim() === "## Drawing") {
      return [offset, offset + line.length];
    }
    offset += line.length + 1;
  }
  return null;
}

/**
 * True when content uses the Obsidian Excalidraw plugin's hybrid layout:
 * `# Excalidraw Data` header, a Drawing section, or plugin frontmatter.
 */
export function isObsidianExcalidrawFormat(content: string): boolean {
  return (
    content.includes("# Excalidraw Data") ||
    content.includes("excalidraw-plugin: parsed") ||
    content.includes("```compressed-json") ||
    drawingHeadingSpan(content) !== null
  );
}

/** Parse an Obsidian-format drawing file. */
export function parseObsidianExcalidraw(content: string): ParsedObsidianDrawing {
  return {
    dataJson: extractSceneJson(content),
    textElements: extractTextElements(content),
  };
}

/**
 * Extract the scene JSON from the Drawing section: a fenced `json` or
 * `compressed-json` block, or legacy unfenced JSON directly under the heading.
 */
function extractSceneJson(content: string): string | null {
  const span = drawingHeadingSpan(content);
  if (!span) return null;
  const rest = content.slice(span[1] + 1);
  const lines = rest.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    // Skip blanks and the "%%" comment that may follow the heading.
    if (t.length === 0 || t.startsWith("%%")) continue;

    if (t.startsWith("```")) {
      // Fenced block: ```json or ```compressed-json
      const kind = t.slice(3).trim();
      const buf: string[] = [];
      let closed = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "```") {
          closed = true;
          i = j;
          break;
        }
        buf.push(lines[j]);
      }
      if (closed) {
        return decodeFencedScene(buf.join("\n"), kind);
      }
      return null; // unterminated fence
    }

    if (t.startsWith("{")) {
      // Legacy layout: raw JSON lines directly under the heading.
      const buf = [lines[i]];
      for (let j = i + 1; j < lines.length; j++) {
        const it = lines[j].trim();
        if (it.length === 0 || it.startsWith("%%") || it.startsWith("#")) break;
        buf.push(lines[j]);
      }
      // Trim to the last '}' — mirrors the plugin's sync-merge workaround.
      const trimmed = buf.join("\n").trim();
      const end = trimmed.lastIndexOf("}");
      return end === -1 ? trimmed : trimmed.slice(0, end + 1);
    }

    if (t.startsWith("#")) return null; // next section without a scene block
  }
  return null;
}

function decodeFencedScene(buf: string, kind: string): string | null {
  if (kind === "compressed-json") {
    const cleaned = buf.replace(/[\n\r]/g, "");
    const json = decompressFromBase64(cleaned);
    if (json === null) return null;
    // Validate — a corrupted payload must degrade to the empty scene, not
    // garbage text.
    try {
      JSON.parse(json);
    } catch {
      return null;
    }
    return json;
  }
  const s = buf.trim();
  return s.startsWith("{") ? s : null;
}

/** Extract bullet lines from the `# Text Elements` / `## Text Elements` section. */
function extractTextElements(content: string): string[] {
  const result: string[] = [];
  let inTextSection = false;

  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!inTextSection) {
      if (t === "# Text Elements" || t === "## Text Elements") {
        inTextSection = true;
      }
      continue;
    }
    if (t.length === 0) continue;
    if (t.startsWith("#") || t.startsWith("%%")) break;
    if (t.startsWith("-")) {
      const val = t.slice(1).trim();
      if (val.length > 0) {
        result.push(stripBlockRef(val));
      }
    }
  }

  return result;
}

/**
 * Strip an Obsidian block-reference suffix (` ^blockid`) from a text bullet.
 * The plugin appends `^<id>` to each element bullet; those ids are file-local
 * link anchors, not searchable text.
 */
function stripBlockRef(value: string): string {
  const s = value.trimEnd();
  const hat = s.lastIndexOf("^");
  if (hat === -1) return s;
  const id = s.slice(hat + 1);
  if (id.length === 0 || !/^[A-Za-z0-9-]+$/.test(id)) return s;
  const before = s.slice(0, hat).trimEnd();
  return before.length !== hat ? before : s;
}