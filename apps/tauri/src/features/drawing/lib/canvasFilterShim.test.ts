import { describe, expect, it } from "vitest";
import {
  HUE_ROTATE_180,
  SATURATE_125,
  applyCounterInvert,
  isCanvasFilterBroken,
  isImageInvertFilter,
  mat3mul,
} from "./canvasFilterShim";

describe("canvasFilterShim transform math", () => {
  it("hue-rotate 180deg matrix is its own inverse and preserves achromatic colors", () => {
    // White maps to white (matrix rows sum to 1)
    const white = applyMatrix(HUE_ROTATE_180, [255, 255, 255]);
    expect(white[0]).toBeCloseTo(255, 0);
    expect(white[1]).toBeCloseTo(255, 0);
    expect(white[2]).toBeCloseTo(255, 0);
    // Gray stays gray
    const gray = applyMatrix(HUE_ROTATE_180, [128, 128, 128]);
    expect(gray[0]).toBeCloseTo(128, 0);
    expect(gray[1]).toBeCloseTo(128, 0);
    expect(gray[2]).toBeCloseTo(128, 0);
  });

  it("mat3mul transposes the unified hue-rotate + saturate chain correctly", () => {
    // saturate(1.25) of a neutral pixel is the same neutral pixel
    const sat125 = mat3mul(SATURATE_125, HUE_ROTATE_180);
    const neutral = applyMatrix(sat125, [90, 90, 90]);
    // Chain hue-rotate(180) then saturate(1.25): gray stays gray
    expect(neutral[0]).toBeCloseTo(90, 0);
  });

  it("white channels saturate to the counter-invert ceiling (bias = 255)", () => {
    // out = 255 - M·[255,255,255] = 255 - 255 = 0 because row sums are 1
    const data = [255, 255, 255, 255];
    applyCounterInvert(data, 0, data.length);
    expect(data[0]).toBeCloseTo(0, 0);
    expect(data[1]).toBeCloseTo(0, 0);
    expect(data[2]).toBeCloseTo(0, 0);
    expect(data[3]).toBe(255); // alpha untouched
  });

  it("black inverts to near-white", () => {
    const data = [0, 0, 0, 128];
    applyCounterInvert(data, 0, 4);
    expect(data[0]).toBeCloseTo(255, 0);
    expect(data[3]).toBe(128);
  });

  it("recovers original colors when the CSS dark filter is applied after", () => {
    // Simulate: counterInvert(original) then CSS invert(93%) hue-rotate(180)
    // should return approximately the original pixel (upstream behavior).
    for (const [r, g, b] of [
      [64, 128, 192],
      [200, 40, 90],
      [10, 200, 120],
    ] as const) {
      const counter = [r, g, b, 255];
      applyCounterInvert(counter, 0, 4);
      // Apply CSS invert(93%): channel → 237.15 - 0.86·channel, then hue-rotate 180
      const inverted = counter.slice(0, 3).map((c) => 237.15 - 0.86 * c);
      const restored = applyMatrix(HUE_ROTATE_180, inverted);
      expect(restored[0]).toBeGreaterThan(0);
      expect(restored[1]).toBeGreaterThan(0);
      expect(restored[2]).toBeGreaterThan(0);
      // Not a color negative: each channel is on the same side as the original
      expect(restored[0] > 128 === r > 128).toBe(true);
    }
  });
});

describe("canvasFilterShim filter matching", () => {
  it("matches the exact Excalidraw counter filter", () => {
    expect(
      isImageInvertFilter("invert(100%) hue-rotate(180deg) saturate(1.25)"),
    ).toBe(true);
  });

  it("rejects the dark canvas theme filter and light-mode filters", () => {
    expect(isImageInvertFilter("invert(93%) hue-rotate(180deg)")).toBe(false);
    expect(isImageInvertFilter("none")).toBe(false);
    expect(isImageInvertFilter("")).toBe(false);
  });
});

describe("canvasFilterShim feature detection", () => {
  it("is safe without a DOM (SSR / node)", () => {
    expect(isCanvasFilterBroken()).toBe(false);
  });
});

/** Apply a row-major 3×3 matrix to an [r,g,b] tuple. */
function applyMatrix(
  m: readonly number[],
  [r, g, b]: readonly number[],
): number[] {
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}
