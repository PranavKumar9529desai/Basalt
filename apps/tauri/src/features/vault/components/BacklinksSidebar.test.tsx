import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { BacklinkEntry } from "../types";
import { BacklinksSidebar } from "./BacklinksSidebar";

// @tanstack/react-virtual measures the scroll element via offsetHeight /
// offsetWidth, which are 0 in jsdom. Force a non-zero viewport so the rows
// are actually rendered and assertable.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 300,
  });
});

const entry = (
  name: string,
  mentions: BacklinkEntry["mentions"] = [],
): BacklinkEntry => ({ path: `notes/${name}.md`, name, mentions });

describe("BacklinksSidebar", () => {
  it("shows the empty state when there are no backlinks", () => {
    render(<BacklinksSidebar backlinks={[]} onOpenNote={() => {}} />);
    expect(screen.getByText("No notes link here yet.")).toBeInTheDocument();
  });

  it("renders note headings, mention excerpts, and frontmatter-only hints", async () => {
    const backlinks = [
      entry("a", [{ line: 3, excerpt: "See [[b]] for the plan" }]),
      entry("b", [
        { line: 1, excerpt: "Mention one" },
        { line: 7, excerpt: "Mention two" },
      ]),
      entry("c"),
    ];
    render(<BacklinksSidebar backlinks={backlinks} onOpenNote={() => {}} />);

    expect(await screen.findByText("a")).toBeInTheDocument();
    expect(screen.getByText("See [[b]] for the plan")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("Mention one")).toBeInTheDocument();
    expect(screen.getByText("Mention two")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument();
    expect(screen.getByText("Linked in frontmatter")).toBeInTheDocument();
  });

  it("opens the note at the mention line when an excerpt is clicked", async () => {
    const onOpenNote = vi.fn();
    const backlinks = [entry("a", [{ line: 4, excerpt: "Mention here" }])];
    render(<BacklinksSidebar backlinks={backlinks} onOpenNote={onOpenNote} />);

    fireEvent.click(await screen.findByText("Mention here"));
    expect(onOpenNote).toHaveBeenCalledWith("notes/a.md", 4);
  });

  it("opens the note itself when its heading is clicked", async () => {
    const onOpenNote = vi.fn();
    const backlinks = [entry("a", [{ line: 1, excerpt: "Some excerpt" }])];
    render(<BacklinksSidebar backlinks={backlinks} onOpenNote={onOpenNote} />);

    fireEvent.click(await screen.findByText("a"));
    expect(onOpenNote).toHaveBeenCalledWith("notes/a.md");
  });

  it("filters entries by note name", async () => {
    render(
      <BacklinksSidebar
        backlinks={[entry("alpha"), entry("beta")]}
        onOpenNote={() => {}}
      />,
    );

    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "alp" },
    });
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("renders a header with the backlink count", () => {
    render(
      <BacklinksSidebar
        backlinks={[entry("a"), entry("b")]}
        onOpenNote={() => {}}
      />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});