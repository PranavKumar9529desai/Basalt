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
});
