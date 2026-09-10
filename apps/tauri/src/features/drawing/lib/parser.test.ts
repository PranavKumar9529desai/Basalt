import { describe, expect, it } from "vitest";
import {
  extractTextElementsFromJson,
  parseDrawingContent,
  serializeDrawingMarkdown,
  EMPTY_DRAWING_JSON,
} from "./parser";

describe("Drawing Parser & Serializer", () => {
  it("extracts text elements from scene JSON", () => {
    const json = JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [
        { type: "rectangle", id: "r1", isDeleted: false },
        { type: "text", id: "t1", text: "[[Architecture]]", isDeleted: false },
        { type: "text", id: "t2", text: "Line 1\nLine 2", isDeleted: false },
        { type: "text", id: "t3", text: "Deleted Text", isDeleted: true },
      ],
    });

    const texts = extractTextElementsFromJson(json);
    expect(texts).toEqual(["[[Architecture]]", "Line 1", "Line 2"]);
  });

  it("round-trips scene JSON to hybrid markdown and back", () => {
    const json = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "basalt",
      elements: [
        { type: "text", id: "t1", text: "[[Backend]]", isDeleted: false },
        { type: "text", id: "t2", text: "Database", isDeleted: false },
      ],
      appState: { viewBackgroundColor: "#121110" },
      files: {},
    });

    const markdown = serializeDrawingMarkdown(json);
    expect(markdown).toContain("type: excalidraw");
    expect(markdown).toContain("version: 2");
    expect(markdown).toContain("# Drawing Text & Elements");
    expect(markdown).toContain("- [[Backend]]");
    expect(markdown).toContain("- Database");
    expect(markdown).toContain("%%#drawing-data");

    const parsed = parseDrawingContent(markdown);
    expect(parsed.data_json.trim()).toBe(json.trim());
    expect(parsed.text_elements).toEqual(["[[Backend]]", "Database"]);
    expect(parsed.created).toBeTruthy();
    expect(parsed.updated).toBeTruthy();
  });

  it("parses pure .excalidraw JSON files directly", () => {
    const json = JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [{ type: "text", text: "Direct Note", isDeleted: false }],
    });

    const parsed = parseDrawingContent(json);
    expect(parsed.data_json).toBe(json);
    expect(parsed.text_elements).toEqual(["Direct Note"]);
  });

  it("falls back to EMPTY_DRAWING_JSON if no drawing-data block is found", () => {
    const markdown = "# Just some markdown\n\nNo drawing here.";
    const parsed = parseDrawingContent(markdown);
    expect(parsed.data_json).toBe(EMPTY_DRAWING_JSON);
  });
  it("parses Obsidian Excalidraw format with # Drawing and ```json fence", () => {
    const content = [
      "---",
      "excalidraw-plugin: parsed",
      "tags: [excalidraw]",
      "---",
      "# Text Elements",
      "- [[System Architecture]] ^abc123",
      "- Load Balancer",
      "",
      "# Drawing",
      "```json",
      '{"type":"excalidraw","version":2,"source":"obsidian-excalidraw-plugin","elements":[{"type":"text","text":"Hello","isDeleted":false}],"appState":{},"files":{}}',
      "```",
      "%%",
    ].join("\n");

    const parsed = parseDrawingContent(content);
    expect(parsed.data_json).toContain("obsidian-excalidraw-plugin");
    expect(parsed.text_elements).toEqual(["[[System Architecture]]", "Load Balancer"]);
  });

  it("parses Obsidian Excalidraw format with ## Drawing double-hash heading", () => {
    const content = [
      "---",
      "excalidraw-plugin: parsed",
      "---",
      "# Text Elements",
      "- Item one",
      "",
      "## Drawing",
      "```json",
      '{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}',
      "```",
      "%%",
    ].join("\n");

    const parsed = parseDrawingContent(content);
    expect(parsed.data_json).toContain('"elements":[]');
    expect(parsed.text_elements).toEqual(["Item one"]);
  });

  it("falls back to EMPTY_DRAWING_JSON for corrupt compressed-json blocks", () => {
    const content = [
      "---",
      "excalidraw-plugin: parsed",
      "---",
      "# Drawing",
      "```compressed-json",
      "LZStringCompressedData",
      "```",
      "%%",
    ].join("\n");

    const parsed = parseDrawingContent(content);
    expect(parsed.data_json).toBe(EMPTY_DRAWING_JSON);
  });
  it("decompresses a real Obsidian compressed-json drawing block", () => {
    // Scene compressed with LZString.compressToBase64 (same as the plugin).
    const compressed =
      "N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkXoBGdXNnSMAtCgw4CxcVEycA5tmbkYmGAFsYjMDQQBtUJFgJwKMGRB5zYAIzWwl8wAkNmegAIAZvnpaXgDyQniiajY0ACIaMM64CD5YNDAAvgC65OhQUADKYOjOCMCp5D7YmgbwJalAA=";
    const content = [
      "---",
      "excalidraw-plugin: parsed",
      "tags: [excalidraw]",
      "---",
      "# Excalidraw Data",
      "## Text Elements",
      "- Hello from Obsidian ^x1",
      "## Drawing",
      "```compressed-json",
      compressed,
      "```",
      "%%",
    ].join("\n");

    const parsed = parseDrawingContent(content);
    expect(parsed.data_json).toContain('"type":"excalidraw"');
    expect(parsed.data_json).toContain("Hello from Obsidian");
    expect(parsed.text_elements).toEqual(["Hello from Obsidian"]);
  });
});


