import { describe, expect, it } from "vitest";
import {
  buildRichPasteChoices,
  extractFileUris,
  looksLikeUri,
} from "../../src/input/paste-extension";

describe("extractFileUris", () => {
  it("reads file:// entries and decodes their filenames", () => {
    const dt = {
      getData(type: string) {
        if (type === "text/uri-list")
          return "file:///home/a/My%20Note.pdf\nfile:///tmp/photo.png";
        return "";
      },
    } as unknown as DataTransfer;

    expect(extractFileUris(dt)).toEqual([
      { uri: "file:///home/a/My%20Note.pdf", filename: "My Note.pdf" },
      { uri: "file:///tmp/photo.png", filename: "photo.png" },
    ]);
  });

  it("ignores comments and non-file URIs", () => {
    const dt = {
      getData(type: string) {
        if (type === "text/uri-list")
          return "# a comment\nhttps://example.com/\nfile:///x.txt\n";
        return "";
      },
    } as unknown as DataTransfer;

    expect(extractFileUris(dt)).toEqual([
      { uri: "file:///x.txt", filename: "x.txt" },
    ]);
  });

  it("returns [] when uri-list holds only web URLs", () => {
    const dt = {
      getData(type: string) {
        if (type === "text/uri-list") return "https://x/\n";
        return "";
      },
    } as unknown as DataTransfer;

    expect(extractFileUris(dt)).toEqual([]);
  });

  it("returns [] when uri-list is empty", () => {
    const dt = {
      getData() {
        return "";
      },
    } as unknown as DataTransfer;

    expect(extractFileUris(dt)).toEqual([]);
  });
});

describe("looksLikeUri", () => {
  it("accepts http(s), mailto, ftp", () => {
    for (const s of [
      "https://obsidian.md",
      "http://x.io/a",
      "mailto://a@b.c",
      "ftp://x",
    ]) {
      expect(looksLikeUri(s)).toBe(true);
    }
  });

  it("rejects plain words and relative paths", () => {
    for (const s of ["hello world", "a/b/c.txt", "not a url", "www.cnn.com"]) {
      expect(looksLikeUri(s)).toBe(false);
    }
  });

  it("rejects empty string", () => {
    expect(looksLikeUri("")).toBe(false);
  });
});

describe("buildRichPasteChoices", () => {
  it("smart mode leads with markdown and offers plain when they differ", () => {
    const c = buildRichPasteChoices("**bold**", "bold", "smart");
    expect(c.lead).toBe("keep-formatting");
    expect(c.alternative).toBe("plain-text");
    expect(c.ambiguous).toBe(true);
  });

  it("smart mode is unambiguous when both flavors are textually equal", () => {
    const c = buildRichPasteChoices("hello", "hello", "smart");
    expect(c.ambiguous).toBe(false);
  });

  it("smart mode is unambiguous when the clipboard has no plain counterpart", () => {
    const c = buildRichPasteChoices("**bold**", "", "smart");
    expect(c.ambiguous).toBe(false);
  });

  it("keep-formatting mode always leads with markdown", () => {
    const c = buildRichPasteChoices("**bold**", "bold", "keep-formatting");
    expect(c.lead).toBe("keep-formatting");
    expect(c.alternative).toBe("plain-text");
    expect(c.ambiguous).toBe(true);
  });

  it("plain-text mode leads with the plain text flavor", () => {
    const c = buildRichPasteChoices("**bold**", "bold", "plain-text");
    expect(c.lead).toBe("plain-text");
    expect(c.alternative).toBe("keep-formatting");
  });

  it("plain-text mode with no plain counterpart still goes rich (non-ambiguous)", () => {
    const c = buildRichPasteChoices("**bold**", "", "plain-text");
    expect(c.lead).toBe("keep-formatting");
    expect(c.ambiguous).toBe(false);
  });
});
