import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { EditorState } from "@codemirror/state";

import { useTaskModalStore } from "../store";
import { CreateTaskModal } from "./CreateTaskModal";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Partial mock: keep the real `buildTaskLine` composer (tests assert the
// exact text it produces) and stub only the DOM view lookup.
vi.mock("@workspace/editor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/editor")>()),
  findActiveMarkdownView: vi.fn(),
}));

const mockInvoke = invoke as unknown as Mock;

interface FakeView {
  state: EditorState;
  dispatch: ReturnType<typeof vi.fn>;
}

/** A real CM state (doc + cursor) with a recording dispatch — enough to
 * assert the insert/replace transaction the modal dispatches. */
function viewFor(doc: string, cursor = doc.length): FakeView {
  return {
    state: EditorState.create({ doc, selection: { anchor: cursor } }),
    dispatch: vi.fn(),
  };
}

function setup() {
  render(
    <CreateTaskModal getActivePath={() => "notes/tasks.md"} />,
  );
}

describe("CreateTaskModal", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    (findActiveMarkdownView as unknown as Mock).mockReset();
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

  it("inserts the composed task line at the caret (no IPC write)", async () => {
    const view = viewFor("hello world");
    (findActiveMarkdownView as unknown as Mock).mockReturnValue(view);
    setup();
    act(() => useTaskModalStore.getState().openCreate());

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Ship release" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(invoke).not.toHaveBeenCalled(); // mutations never touch Rust
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 11, insert: "\n- [ ] Ship release" },
      selection: { anchor: 11 + "\n- [ ] Ship release".length },
    });
    expect(useTaskModalStore.getState().isOpen).toBe(false);
  });

  it("fills an empty line without a leading newline", async () => {
    const view = viewFor("hello\n", 6); // cursor on the empty second line
    (findActiveMarkdownView as unknown as Mock).mockReturnValue(view);
    setup();
    act(() => useTaskModalStore.getState().openCreate());

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "First task" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 6, insert: "- [ ] First task" },
      selection: { anchor: 6 + "- [ ] First task".length },
    });
  });

  it("serializes signifiers into the dispatched line text", async () => {
    const view = viewFor("hello\nworld", 11);
    (findActiveMarkdownView as unknown as Mock).mockReturnValue(view);
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

    const insert =
      "- [ ] Fix bug 📅2024-02-01 ⏳2024-01-25 🛫2024-01-20 #release";
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 11, insert: `\n${insert}` },
      selection: { anchor: 11 + insert.length + 1 },
    });
    expect(invoke).not.toHaveBeenCalled();
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

  it("errors when no editor is open", async () => {
    (findActiveMarkdownView as unknown as Mock).mockReturnValue(null);
    setup();
    act(() => useTaskModalStore.getState().openCreate());

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Orphan" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No editor is open to add the task to.",
    );
  });

  it("hydrates edit mode from get_task_line and replaces the line in place", async () => {
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
    // 3-line doc; the task lives on line 3 ("- [x] Ship release ⏫ …").
    const doc = "title\n\n- [x] Ship release ⏫ 📅2024-02-01 🔁every week #release";
    const view = viewFor(doc);
    (findActiveMarkdownView as unknown as Mock).mockReturnValue(view);

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

    const line = view.state.doc.line(3);
    const newText =
      "- [x] Ship release v2 ⏫ 📅2024-02-01 🔁every week #release";
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: line.from, to: line.to, insert: newText },
      selection: { anchor: line.from + newText.length },
    });
    // Edit mode never invokes update_task — only the read hydration.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("get_task_line", {
      path: "notes/tasks.md",
      lineNumber: 3,
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

// Re-import for the type-only assertion below (avoids shadowing in body).
import { findActiveMarkdownView } from "@workspace/editor";