import { describe, expect, it } from "vitest";
import { buildCopyAsText } from "./copyActions";

const node = { relPath: "notes/My note.md", name: "My note" };

describe("buildCopyAsText", () => {
  it("wikilink uses the stem path, sans extension", () => {
    expect(buildCopyAsText("wikilink", node, null)).toBe("[[notes/My note]]");
  });

  it("markdown links the display name to the encoded rel path", () => {
    expect(buildCopyAsText("markdown", node, null)).toBe(
      "[My note](notes/My%20note.md)",
    );
  });

  it("path is the vault-relative path verbatim", () => {
    expect(buildCopyAsText("path", node, null)).toBe("notes/My note.md");
  });

  it("url is an obsidian:// scheme with vault name + encoded file", () => {
    expect(buildCopyAsText("url", node, "/home/u/vault")).toBe(
      "obsidian://open?vault=vault&file=notes%2FMy%20note",
    );
  });

  it("url omits the vault query when the root is unknown", () => {
    expect(buildCopyAsText("url", node, null)).toBe(
      "obsidian://open?vault=&file=notes%2FMy%20note",
    );
  });
});