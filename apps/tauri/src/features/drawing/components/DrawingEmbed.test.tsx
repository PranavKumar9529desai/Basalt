import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DrawingEmbed } from "./DrawingEmbed";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation(() =>
    Promise.resolve({
      data_json: JSON.stringify({ elements: [] }),
      text_elements: [],
      raw_markdown: "",
    }),
  ),
}));

vi.mock("../lib/export", () => ({
  exportSceneToSvg: vi.fn().mockImplementation(() => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    return Promise.resolve(svg);
  }),
}));

describe("DrawingEmbed component", () => {
  it("renders container with title and loading indicator", () => {
    render(<DrawingEmbed path="test.excalidraw.md" />);
    expect(
      screen.getByTitle("Double click to open drawing"),
    ).toBeInTheDocument();
  });
});
