import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagEntry } from "../types";
import { TagsSidebar } from "./TagsSidebar";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

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

const tag = (tag: string, count: number): TagEntry => ({ tag, count });

describe("TagsSidebar", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue([]);
  });

  it("loads tag counts from get_tag_counts", async () => {
    vi.mocked(invoke).mockResolvedValue([
      tag("ideas", 3),
      tag("project/2026", 2),
    ]);

    render(<TagsSidebar onOpenTag={() => {}} />);

    expect(await screen.findByText("#ideas")).toBeInTheDocument();
    expect(screen.getByText("#project/2026")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("get_tag_counts");
  });

  it("shows the empty state when the vault has no tags", async () => {
    render(<TagsSidebar onOpenTag={() => {}} />);

    expect(
      await screen.findByText(/No tags yet/i),
    ).toBeInTheDocument();
  });

  it("opens search with `tag:<tag>` when a pill is clicked", async () => {
    vi.mocked(invoke).mockResolvedValue([tag("ideas", 1)]);
    const onOpenTag = vi.fn();

    render(<TagsSidebar onOpenTag={onOpenTag} />);

    fireEvent.click(await screen.findByText("#ideas"));
    expect(onOpenTag).toHaveBeenCalledWith("ideas");
  });

  it("renders each tag's note count", async () => {
    vi.mocked(invoke).mockResolvedValue([tag("ideas", 7)]);
    render(<TagsSidebar onOpenTag={() => {}} />);

    expect(
      await waitFor(() => screen.getByText("7")),
    ).toBeInTheDocument();
  });

  it("surfaces an error state when the IPC call fails", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("boom"));
    render(<TagsSidebar onOpenTag={() => {}} />);

    expect(
      await screen.findByText("Could not load tags."),
    ).toBeInTheDocument();
  });
});