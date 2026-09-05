/**
 * Embed reveal — `![[target]]` in live-preview's single walk.
 *
 * The chip is only rendered when the caret is OFF the embed's line; the raw
 * syntax stays visible for editing when the caret is ON it (the WYSIWYM reveal
 * contract shared with list bullets, HR, heading-7). Reading mode never emits
 * a chip — the reading-mode media plugin owns that span.
 */
import { describe, expect, it } from "vitest";
import { resolveAssetFacet } from "../../src";
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

describe("live-preview real media (ADR-034 part C)", () => {
  const resolvable = resolveAssetFacet.of((target: string) =>
    target.endsWith(".png") || target.endsWith(".mp4") || target.endsWith(".mp3")
      ? `asset:///vault/${target}`
      : null,
  );

  it("renders a real media widget off the active line when the target resolves", () => {
    const doc = "line above\n![[attachments/photo.png]]";
    const { report } = testMarkdownFixture(doc, {
      selection: 0,
      extensions: [resolvable],
    });
    assertDecorations(report).toHaveReplace(11, 37, "EmbedMediaWidget");
  });

  it("renders video and audio embeds as real media too", () => {
    const doc = "![[clip.mp4]]\n\n![[sound.mp3]]";
    const { report } = testMarkdownFixture(doc, {
      selection: 14, // empty middle line — neither embed is active
      extensions: [resolvable],
    });
    assertDecorations(report)
      .toHaveReplace(0, 13, "EmbedMediaWidget")
      .toHaveReplace(15, 29, "EmbedMediaWidget");
  });

  it("keeps the fallback chip for unresolved targets — never a broken <img>", () => {
    const doc = "line above\n![[ghost.png]]";
    const { report } = testMarkdownFixture(doc, {
      selection: 0,
      extensions: [resolveAssetFacet.of(() => null)],
    });
    assertDecorations(report).toHaveReplace(11, 25, "EmbedChipWidget");
  });

  it("renders media even with the caret on the embed's active line (ADR-034)", () => {
    const doc = "![[attachments/photo.png]]";
    const { report } = testMarkdownFixture(doc, {
      selection: 20, // inside the embed span
      extensions: [resolvable],
    });
    assertDecorations(report).toHaveReplace(0, 26, "EmbedMediaWidget");
  });

  it("keeps the raw source visible under the caret for broken embeds, chip off it", () => {
    const never = resolveAssetFacet.of(() => null);
    const doc = "![[ghost.png]]";
    const onLine = testMarkdownFixture(doc, {
      selection: 5,
      extensions: [never],
    });
    expect(
      onLine.report.replaces.some(
        (r) => r.widget === "EmbedChipWidget" || r.widget === "EmbedMediaWidget",
      ),
    ).toBe(false);
    const offLine = testMarkdownFixture("line above\n![[ghost.png]]", {
      selection: 0,
      extensions: [never],
    });
    assertDecorations(offLine.report).toHaveReplace(11, 25, "EmbedChipWidget");
  });
});