import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { useTaskModalStore } from "../store";
import { CreateTaskModal } from "./CreateTaskModal";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// vi.mocked is not wired in this repo's vitest setup; type the mock directly.
const mockInvoke = invoke as unknown as Mock;

function setup() {
  const onTaskCreated = vi.fn();
  render(
    <CreateTaskModal
      getActivePath={() => "notes/tasks.md"}
      onTaskCreated={onTaskCreated}
    />,
  );
  return { onTaskCreated };
}

describe("CreateTaskModal", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useTaskModalStore.setState({
      isOpen: false,
      mode: "create",
      editTarget: null,
    });
  });

  it("is hidden until the store opens it", () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("creates a task and navigates to the new line", async () => {
    mockInvoke.mockResolvedValue(5);
    const { onTaskCreated } = setup();
    act(() => useTaskModalStore.getState().openCreate());

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Ship release" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(invoke).toHaveBeenCalledWith("create_task", {
      input: { path: "notes/tasks.md", description: "Ship release" },
    });
    expect(useTaskModalStore.getState().isOpen).toBe(false);
    expect(onTaskCreated).toHaveBeenCalledWith("notes/tasks.md", 5);
  });

  it("serializes signifiers into the create input", async () => {
    mockInvoke.mockResolvedValue(1);
    setup();
    act(() => useTaskModalStore.getState().openCreate());

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Fix bug" },
    });
    fireEvent.change(screen.getByLabelText("Due"), {
      target: { value: "2024-02-01" },
    });
    fireEvent.change(screen.getByLabelText("Scheduled"), {
      target: { value: "2024-01-25" },
    });
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "2024-01-20" },
    });
    // Add a tag via the tag input.
    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "release" },
    });
    fireEvent.keyDown(screen.getByLabelText("Tags"), { key: "Enter" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(invoke).toHaveBeenCalledWith("create_task", {
      input: {
        path: "notes/tasks.md",
        description: "Fix bug",
        due: "2024-02-01",
        scheduled: "2024-01-25",
        start: "2024-01-20",
        tags: ["release"],
      },
    });
  });

  it("requires a description", async () => {
    setup();
    act(() => useTaskModalStore.getState().openCreate());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Description is required.",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("requires at least one date for recurring tasks", async () => {
    setup();
    act(() => useTaskModalStore.getState().openCreate());

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Recurring chore" },
    });
    // Custom recurrence rule with no dates.
    fireEvent.change(
      screen.getByPlaceholderText(/Custom rule/),
      { target: { value: "every 2 weeks" } },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Recurring tasks need at least one date",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("removes a tag chip with the × button", async () => {
    setup();
    act(() => useTaskModalStore.getState().openCreate());

    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "alpha" },
    });
    fireEvent.keyDown(screen.getByLabelText("Tags"), { key: "Enter" });
    expect(screen.getByText("#alpha")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove tag alpha" }));
    expect(screen.queryByText("#alpha")).not.toBeInTheDocument();
  });

  it("hydrates edit mode from get_task_line and updates in place", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_task_line") {
        return Promise.resolve({
          raw: "- [x] Ship release ⏫ 📅2024-02-01 🔁every week #release",
          status_char: "x",
          description: "Ship release",
          signifiers: {
            priority: "high",
            due: "2024-02-01",
            scheduled: null,
            start: null,
            recurrence: "every week",
            tags: ["#release"],
          },
        });
      }
      return Promise.resolve(undefined);
    });
    setup();
    act(() =>
      useTaskModalStore.getState().openEdit({
        path: "notes/tasks.md",
        line: 3,
      }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Description")).toHaveValue("Ship release"),
    );
    // Edit-only status select shows the hydrated done status (trigger value
    // and popup item both contain the label).
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Due")).toHaveValue("2024-02-01");
    expect(screen.getAllByText("#release")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Ship release v2" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(invoke).toHaveBeenCalledWith("update_task", {
      input: {
        path: "notes/tasks.md",
        line_number: 3,
        description: "Ship release v2",
        priority: "high",
        due: "2024-02-01",
        recurrence: "every week",
        tags: ["release"],
        status: "done",
      },
    });
    expect(useTaskModalStore.getState().isOpen).toBe(false);
  });

  it("dismisses on Escape (dialog onOpenChange(false))", () => {
    setup();
    act(() => useTaskModalStore.getState().openCreate());

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(useTaskModalStore.getState().isOpen).toBe(false);
  });
});