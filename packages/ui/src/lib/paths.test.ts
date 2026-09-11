import { describe, expect, it } from "vitest";
import {
  basename,
  isCanvasPath,
  isDocumentPath,
  isDrawingPath,
  isMarkdownPath,
  normalizePath,
  stemOf,
} from "./paths";

describe("paths utility", () => {
  describe("basename", () => {
    it("extracts filename from POSIX path", () => {
      expect(basename("folder/subfolder/note.md")).toBe("note.md");
    });

    it("extracts filename from Windows path", () => {
      expect(basename("folder\\subfolder\\note.md")).toBe("note.md");
    });

    it("returns bare filename unchanged", () => {
      expect(basename("note.md")).toBe("note.md");
    });

    it("handles empty path", () => {
      expect(basename("")).toBe("");
    });
  });

  describe("stemOf", () => {
    it("strips .md extension", () => {
      expect(stemOf("folder/subfolder/meeting.md")).toBe("meeting");
    });

    it("strips .canvas extension", () => {
      expect(stemOf("project/diagram.canvas")).toBe("diagram");
    });

    it("handles filenames with no extension", () => {
      expect(stemOf("notes/untitled")).toBe("untitled");
    });

    it("strips .excalidraw.md and .excalidraw extensions", () => {
      expect(stemOf("sketch.excalidraw.md")).toBe("sketch");
      expect(stemOf("diagrams/architecture.EXCALIDRAW.MD")).toBe("architecture");
      expect(stemOf("whiteboard.excalidraw")).toBe("whiteboard");
    });

    it("handles multiple dots correctly", () => {
      expect(stemOf("archive.tar.gz")).toBe("archive.tar");
    });
  });

  describe("extension checkers", () => {
    it("identifies markdown files case-insensitively", () => {
      expect(isMarkdownPath("note.md")).toBe(true);
      expect(isMarkdownPath("note.MD")).toBe(true);
      expect(isMarkdownPath("note.markdown")).toBe(false);
      expect(isMarkdownPath("note.canvas")).toBe(false);
      expect(isMarkdownPath("")).toBe(false);
    });

    it("identifies canvas files case-insensitively", () => {
      expect(isCanvasPath("board.canvas")).toBe(true);
      expect(isCanvasPath("board.CANVAS")).toBe(true);
      expect(isCanvasPath("board.md")).toBe(false);
      expect(isCanvasPath("")).toBe(false);
    });

    it("identifies drawing files case-insensitively", () => {
      expect(isDrawingPath("diagram.excalidraw.md")).toBe(true);
      expect(isDrawingPath("sketch.EXCALIDRAW.MD")).toBe(true);
      expect(isDrawingPath("scene.excalidraw")).toBe(true);
      expect(isDrawingPath("scene.EXCALIDRAW")).toBe(true);
      expect(isDrawingPath("note.md")).toBe(false);
      expect(isDrawingPath("board.canvas")).toBe(false);
      expect(isDrawingPath("")).toBe(false);
    });

    it("identifies document paths", () => {
      expect(isDocumentPath("note.md")).toBe(true);
      expect(isDocumentPath("board.canvas")).toBe(true);
      expect(isDocumentPath("diagram.excalidraw.md")).toBe(true);
      expect(isDocumentPath("scene.excalidraw")).toBe(true);
      expect(isDocumentPath("image.png")).toBe(false);
    });
  });

  describe("normalizePath", () => {
    it("normalizes slashes and collapses duplicates", () => {
      expect(normalizePath("folder\\subfolder//file.md")).toBe(
        "folder/subfolder/file.md",
      );
    });

    it("trims leading and trailing slashes", () => {
      expect(normalizePath("/folder/file.md/")).toBe("folder/file.md");
    });

    it("handles empty string", () => {
      expect(normalizePath("")).toBe("");
    });
  });
});
