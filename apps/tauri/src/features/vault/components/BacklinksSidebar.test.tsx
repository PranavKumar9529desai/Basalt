import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

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

describe("BacklinksSidebar", () => {
  it("shows the empty state when there are no backlinks", () => {
    render(<BacklinksSidebar backlinks={[]} onOpenNote={() => {}} />);
    expect(screen.getByText("No notes link here yet.")).toBeInTheDocument();
  });

  it("virtualizes and renders each backlink row", async () => {
    const backlinks = ["notes/a.md", "notes/b.md", "notes/c.md"];
    render(<BacklinksSidebar backlinks={backlinks} onOpenNote={() => {}} />);
    for (const path of backlinks) {
      expect(
        await screen.findByText(path.split("/").pop() as string),
      ).toBeInTheDocument();
    }
  });

  it("renders a header with the backlink count", () => {
    render(
      <BacklinksSidebar
        backlinks={["notes/a.md", "notes/b.md"]}
        onOpenNote={() => {}}
      />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
