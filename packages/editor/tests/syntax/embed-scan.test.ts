/**
 * Scanner test for `scanEmbedWikiLinks` (src/input/embed-utils.ts) — the single
 * scan behind edit-mode embed chips and reading-mode embed media.
 *
 * Regression (ADR-033): the Lezer grammar previously never produced a
 * `WikiLink` node for `![[...]]` (the built-in Image parser swallowed `![`),
 * so this scanner returned nothing and embeds silently stopped rendering.
 * These tests pin the fixed grammar + scanner contract.
 *
 * The scanner reads only `view.state`, so a `{ state }` facade avoids mounting
 * a real EditorView (no DOM required).
 */
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../_helpers";
import { scanEmbedWikiLinks } from "../../src/input/embed-utils";

function scan(doc: string) {
  const { state } = parseMarkdown(doc, { pipes: false });
  return scanEmbedWikiLinks({ state } as unknown as Parameters<
    typeof scanEmbedWikiLinks
  >[0]);
}

describe("scanEmbedWikiLinks", () => {
  it("finds image embeds with subfolder paths", () => {
    const found = scan("![[attachments/photo.png]]");
    expect(found).toEqual([
      { from: 0, to: 26, target: "attachments/photo.png" },
    ]);
  });

  it("finds audio/video/pdf embeds", () => {
    const found = scan("![[sound.mp3]] and ![[clip.webm]] and ![[doc.pdf]]");
    expect(found.map((r) => r.target)).toEqual([
      "sound.mp3",
      "clip.webm",
      "doc.pdf",
    ]);
  });

  it("strips aliases and heading fragments from the target", () => {
    const found = scan("![[wireframe.png|alt text]] ![[note#section]]");
    expect(found.map((r) => r.target)).toEqual(["wireframe.png", "note"]);
  });

  it("finds several embeds and ignores plain wikilinks", () => {
    const found = scan(
      "See [[Plain Note]] and ![[img.png]] and ![[voice.mp3]] together",
    );
    expect(found.map((r) => r.target)).toEqual(["img.png", "voice.mp3"]);
  });

  it("ignores standard markdown images", () => {
    const found = scan("![alt](img.png) and also ![[real.png]]");
    expect(found.map((r) => r.target)).toEqual(["real.png"]);
  });

  it("skips embeds inside fenced code blocks", () => {
    const doc = "```\n![[not-an-embed.png]]\n```\n\ntext";
    const found = scan(doc);
    expect(found).toEqual([]);
  });
});