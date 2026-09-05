/**
 * Embed reveal — `![[target]]` in live-preview's single walk.
 *
 * The chip is only rendered when the caret is OFF the embed's line; the raw
 * syntax stays visible for editing when the caret is ON it (the WYSIWYM reveal
 * contract shared with list bullets, HR, heading-7). Reading mode never emits
 * a chip — the reading-mode media plugin owns that span.
 */
import { describe, expect, it } from "vitest";
import { assertDecorations, testMarkdownFixture } from "../_helpers";

describe("embed chip reveal — live mode", () => {
  it("renders a chip when the caret is off the embed line", () => {
    const doc = "line above\n![[attachments/photo.png]]";
    const { report } = testMarkdownFixture(doc, { selection: 0 });
    // The whole `![[...]]` span (indices 11..37) is replaced by the chip.
    assertDecorations(report).toHaveReplace(11, 37, "EmbedChipWidget");
  });

  it("leaves the raw embed visible when the caret is on its line", () => {
    const doc = "![[attachments/photo.png]]";
    const { report } = testMarkdownFixture(doc, { selection: 20 });
    // No replace for the embed span — raw syntax stays editable.
    expect(report.replaces.some((r) => r.widget === "EmbedChipWidget")).toBe(false);
  });

  it("renders chips for non-image assets (video, pdf) too", () => {
    const doc = "![[clip.mp4]]\n\n![[report.pdf]]";
    // Caret on the empty middle line — both embeds are off the active line.
    const { report } = testMarkdownFixture(doc, { selection: 14 });
    assertDecorations(report)
      .toHaveReplace(0, 13, "EmbedChipWidget")
      .toHaveReplace(15, 30, "EmbedChipWidget");
  });

  it("renders a chip for embeds with alias syntax", () => {
    const doc = "text\n![[sound.mp3|100x50]]";
    const { report } = testMarkdownFixture(doc, { selection: 0 });
    assertDecorations(report).toHaveReplace(5, 26, "EmbedChipWidget");
  });

  it("does not chip plain wikilinks", () => {
    const doc = "word [[Note]] word";
    const { report } = testMarkdownFixture(doc, { selection: 0 });
    expect(report.replaces.some((r) => r.widget === "EmbedChipWidget")).toBe(false);
  });
});

describe("embed chip — reading mode (never raw, no chip)", () => {
  it("does not emit a chip regardless of caret position", () => {
    const doc = "![[attachments/photo.png]]";
    for (const selection of [0, 20]) {
      const { report } = testMarkdownFixture(doc, {
        renderMode: "reading",
        selection,
      });
      expect(
        report.replaces.some((r) => r.widget === "EmbedChipWidget"),
        `selection=${selection}`,
      ).toBe(false);
    }
  });
});