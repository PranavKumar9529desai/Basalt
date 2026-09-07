import { describe, expect, it } from "vitest";
import { edgePreview } from "./EdgeDropZones";

describe("edgePreview", () => {
  it("maps left to the full-height left half with the sash line at its right edge", () => {
    const { region, line } = edgePreview("left");
    expect(region).toContain("w-1/2");
    expect(region).toContain("left-0");
    expect(region).toContain("inset-y-0");
    expect(line).toMatchObject({ right: 0, width: 3 });
  });

  it("maps right to the full-height right half with the sash line at its left edge", () => {
    const { region, line } = edgePreview("right");
    expect(region).toContain("w-1/2");
    expect(region).toContain("right-0");
    expect(region).toContain("inset-y-0");
    expect(line).toMatchObject({ left: 0, width: 3 });
  });

  it("maps top to the full-width top half with the sash line at its bottom edge", () => {
    const { region, line } = edgePreview("top");
    expect(region).toContain("h-1/2");
    expect(region).toContain("top-0");
    expect(region).toContain("inset-x-0");
    expect(line).toMatchObject({ bottom: 0, height: 3 });
  });

  it("maps bottom to the full-width bottom half with the sash line at its top edge", () => {
    const { region, line } = edgePreview("bottom");
    expect(region).toContain("h-1/2");
    expect(region).toContain("bottom-0");
    expect(region).toContain("inset-x-0");
    expect(line).toMatchObject({ top: 0, height: 3 });
  });

  it("never advertises the 25%/33% hit-wedge footprint", () => {
    for (const edge of ["left", "right", "top", "bottom"] as const) {
      const { region } = edgePreview(edge);
      expect(region).not.toContain("w-1/4");
      expect(region).not.toContain("h-1/3");
      expect(region).not.toContain("left-1/4");
    }
  });
});
