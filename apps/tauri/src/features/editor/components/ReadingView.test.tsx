import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReadingView } from "./ReadingView";

const services = {
  findNote: vi.fn(() => undefined),
  openNote: vi.fn(),
};

describe("ReadingView", () => {
  it("renders the note as readable content instead of raw Markdown", () => {
    render(
      <ReadingView
        title="A note"
        sourcePath="A note.md"
        markdown={"---\nstatus: draft\n---\n# Heading\n\n**bold** and [[Target]]"}
        services={services}
      />,
    );

    expect(screen.getByRole("heading", { name: "A note" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Heading" })).toBeTruthy();
    expect(screen.getByText("draft")).toBeTruthy();
    expect(screen.getByText("bold").closest("strong")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Target" })).toBeTruthy();
    expect(screen.queryByText("# Heading")).toBeNull();
  });

  it("renders task items and rejects unsafe link protocols", () => {
    render(
      <ReadingView
        title="Links"
        sourcePath="Links.md"
        markdown={"- [x] finished\n\n[unsafe](javascript:alert(1))"}
        services={services}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.queryByRole("link", { name: "unsafe" })).toBeNull();
    expect(screen.getByText("[unsafe](javascript:alert(1))")).toBeTruthy();
  });
});
