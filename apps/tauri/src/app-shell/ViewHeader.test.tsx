import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { LeafTabInfo } from "@workspace/views";
import { ViewHeader } from "./ViewHeader";
import { useTabsStore } from "../features/tabs";

const tab: LeafTabInfo = {
  id: "tab:/vault/Notes/DSA/Binary Search.md",
  path: "/vault/Notes/DSA/Binary Search.md",
  title: "Binary Search.md",
};

describe("ViewHeader", () => {
  beforeEach(() => {
    useTabsStore.setState({
      tabs: {},
      pane: {
        id: "root",
        tabIds: [],
        activeTabId: null,
        previewTabId: null,
      },
      persistVersion: 0,
    });
  });

  it("renders the header controls and centered title", () => {
    render(<ViewHeader tab={tab} vaultPath="/vault" canRename />);

    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reading view" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View actions" })).toBeInTheDocument();
    expect(screen.getByText("DSA / Binary Search")).toBeInTheDocument();
    expect(screen.queryByText("Source mode")).not.toBeInTheDocument();
  });
});
