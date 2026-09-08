import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { LeafTabInfo } from "@workspace/views";
import { ViewHeader } from "./ViewHeader";
import { createLeaf, useTabsStore } from "../features/tabs";

const tab: LeafTabInfo = {
  id: "tab:/vault/Notes/DSA/Binary Search.md",
  path: "/vault/Notes/DSA/Binary Search.md",
  title: "Binary Search.md",
};

describe("ViewHeader", () => {
  beforeEach(() => {
    const leaf = createLeaf();
    useTabsStore.setState({
      tabs: {},
      root: leaf,
      activePaneId: leaf.id,
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
    expect(
      screen.getByRole("button", { name: "View actions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("DSA / Binary Search")).toBeInTheDocument();
    expect(screen.queryByText("Source mode")).not.toBeInTheDocument();
  });

  it("handles back and forward navigation clicks when history is present", () => {
    const tabWithHistory: LeafTabInfo = {
      id: "tab:/vault/Notes/B.md",
      path: "/vault/Notes/B.md",
      title: "B.md",
    };

    useTabsStore.setState({
      tabs: {
        "tab:/vault/Notes/B.md": {
          id: "tab:/vault/Notes/B.md",
          path: "/vault/Notes/B.md",
          title: "B.md",
          leafType: "markdown",
          isPinned: true,
          isPreview: false,
          isDirty: false,
          createdAt: 100,
          lastAccessedAt: 100,
          history: [
            {
              path: "/vault/Notes/A.md",
              title: "A.md",
              leafType: "markdown",
              timestamp: 100,
            },
            {
              path: "/vault/Notes/B.md",
              title: "B.md",
              leafType: "markdown",
              timestamp: 101,
            },
          ],
          historyIndex: 1,
        },
      },
    });

    render(<ViewHeader tab={tabWithHistory} vaultPath="/vault" canRename />);

    const backBtn = screen.getByRole("button", { name: "Back" });
    expect(backBtn).not.toBeDisabled();
    backBtn.click();

    const updatedTab = useTabsStore.getState().tabs["tab:/vault/Notes/B.md"];
    expect(updatedTab.historyIndex).toBe(0);
    expect(updatedTab.path).toBe("/vault/Notes/A.md");
  });
});
