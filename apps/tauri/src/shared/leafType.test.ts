import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { leafRegistry } from "@workspace/views";
import { resolveLeafType } from "./leafType";
import { invoke } from "@tauri-apps/api/core";

const mockedInvoke = vi.mocked(invoke);

describe("resolveLeafType", () => {
  beforeAll(() => {
    // The app-shell registrations never run under vitest; populate the
    // singleton with the real leaf types so leafTypeForPath works.
    leafRegistry.register({
      type: "markdown",
      name: "Markdown",
      extensions: [".md", ".markdown"],
      component: () => null,
    });
    leafRegistry.register({
      type: "drawing",
      name: "Drawing",
      extensions: [".drawing.md", ".excalidraw.md", ".excalidraw"],
      component: () => null,
    });
    leafRegistry.register({
      type: "canvas",
      name: "Canvas",
      extensions: [".canvas"],
      component: () => null,
    });
  });

  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("uses the extension fast path without any IPC", async () => {
    mockedInvoke.mockResolvedValue(true);
    expect(await resolveLeafType("diagram.excalidraw.md")).toBe("drawing");
    expect(await resolveLeafType("sketch.excalidraw")).toBe("drawing");
    expect(await resolveLeafType("whiteboard.canvas")).toBe("canvas");
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("routes a renamed drawing (.md carrying the marker) to the drawing leaf", async () => {
    mockedInvoke.mockResolvedValue(true);
    expect(await resolveLeafType("carfleet.md")).toBe("drawing");
    expect(mockedInvoke).toHaveBeenCalledWith("is_drawing_file", {
      path: "carfleet.md",
    });
  });

  it("keeps plain markdown as markdown", async () => {
    mockedInvoke.mockResolvedValue(false);
    expect(await resolveLeafType("notes.md")).toBe("markdown");
  });

  it("falls back to markdown when classification errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("io"));
    expect(await resolveLeafType("gone.md")).toBe("markdown");
  });
});
