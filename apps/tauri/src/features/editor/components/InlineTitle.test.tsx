import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LeafServices, LeafTabInfo } from "@workspace/views";
import { InlineTitle } from "./InlineTitle";

function makeServices(overrides: Partial<LeafServices> = {}): LeafServices {
  return {
    openNote: vi.fn(),
    markTabDirty: vi.fn(),
    findNote: vi.fn(),
    getOpenTabIds: () => new Set(),
    getOpenTabPaths: () => new Set(),
    getTabInfo: () => null,
    onTabStructureChanged: () => () => {},
    activeNote: null,
    openPinned: () => "",
    renameNote: vi
      .fn()
      .mockResolvedValue({ ok: true as const, path: "/vault/note.md" }),
    ...overrides,
  };
}

const tab: LeafTabInfo = {
  id: "tab:/vault/Note.md",
  path: "/vault/Note.md",
  title: "Note",
};

describe("InlineTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the live note title (prefers getTabInfo after a rename)", () => {
    const services = makeServices({
      getTabInfo: () => ({ path: "/vault/Renamed.md", title: "Renamed" }),
    });
    render(<InlineTitle tab={tab} services={services} />);
    expect(screen.getByRole("button").textContent).toBe("Renamed");
  });

  it("enters edit mode with the name selected on click", () => {
    const services = makeServices({
      getTabInfo: () => ({ path: tab.path, title: "Note" }),
    });
    render(<InlineTitle tab={tab} services={services} />);
    fireEvent.click(screen.getByRole("button"));

    const input = screen.getByRole("textbox");
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).value).toBe("Note");
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe(4);
  });

  it("auto-enters edit mode with the name selected when autoEdit (note creation)", () => {
    const services = makeServices({
      getTabInfo: () => ({ path: tab.path, title: "Note" }),
    });
    render(<InlineTitle tab={tab} services={services} autoEdit />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Note");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);
  });

  it("commits a rename on Enter and returns to display mode", async () => {
    const renameNote = vi
      .fn()
      .mockResolvedValue({ ok: true as const, path: "/vault/Renamed.md" });
    let liveTitle = "Note";
    const services = makeServices({
      renameNote,
      getTabInfo: () => ({ path: "/vault/Renamed.md", title: liveTitle }),
    });
    render(<InlineTitle tab={tab} services={services} />);
    fireEvent.click(screen.getByRole("button"));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(renameNote).toHaveBeenCalledWith(
      { id: tab.id, path: tab.path },
      "Renamed",
    );
    liveTitle = "Renamed";
    expect(await screen.findByRole("button")).toHaveTextContent("Renamed");
  });

  it("notifies the leaf after an explicit Enter commit", async () => {
    const onSubmit = vi.fn();
    const services = makeServices();
    render(<InlineTitle tab={tab} services={services} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Renamed" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(await screen.findByRole("button")).toBeDefined();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("shows the backend error inline, stays in edit mode, and accepts a fix", async () => {
    const renameNote = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        error: "a note named 'Renamed' already exists",
      })
      .mockResolvedValueOnce({ ok: true as const, path: "/vault/Renamed.md" });
    let liveTitle = "Note";
    const services = makeServices({
      renameNote,
      getTabInfo: () => ({ path: tab.path, title: liveTitle }),
    });
    render(<InlineTitle tab={tab} services={services} />);
    fireEvent.click(screen.getByRole("button"));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Renamed" } });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(
      await screen.findByText("a note named 'Renamed' already exists"),
    ).toBeDefined();
    expect(screen.getByRole("textbox")).toBeDefined();

    fireEvent.change(input, { target: { value: "Renamed2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(renameNote).toHaveBeenLastCalledWith(
      { id: tab.id, path: tab.path },
      "Renamed2",
    );
    liveTitle = "Renamed2";
    expect(await screen.findByRole("button")).toHaveTextContent("Renamed2");
  });

  it("cancels on Escape without calling renameNote", () => {
    const renameNote = vi.fn();
    const services = makeServices({
      renameNote,
      getTabInfo: () => ({ path: tab.path, title: "Note" }),
    });
    render(<InlineTitle tab={tab} services={services} />);
    fireEvent.click(screen.getByRole("button"));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByRole("button")).toHaveTextContent("Note");
    expect(renameNote).not.toHaveBeenCalled();
  });

  it("does not commit when the value is unchanged on blur", () => {
    const renameNote = vi.fn();
    const services = makeServices({
      renameNote,
      getTabInfo: () => ({ path: tab.path, title: "Note" }),
    });
    render(<InlineTitle tab={tab} services={services} />);
    fireEvent.click(screen.getByRole("button"));

    const input = screen.getByRole("textbox");
    fireEvent.blur(input);

    expect(renameNote).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveTextContent("Note");
  });

  it("commits an in-progress rename when the title unmounts (tab switch)", () => {
    const renameNote = vi
      .fn()
      .mockResolvedValue({ ok: true as const, path: "/vault/Renamed.md" });
    const services = makeServices({
      renameNote,
      getTabInfo: () => ({ path: tab.path, title: "Note" }),
    });
    const { rerender } = render(
      <InlineTitle tab={tab} services={services} autoEdit />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "MidEdit" } });

    rerender(
      <InlineTitle
        key="tab2"
        tab={{ id: "tab2", path: "/vault/Other.md", title: "Other" }}
        services={services}
      />,
    );

    expect(renameNote).toHaveBeenCalledWith(
      { id: tab.id, path: tab.path },
      "MidEdit",
    );
  });

  it("enters edit mode when a fresh rename signal arrives (F2 / ⋮ menu)", () => {
    const services = makeServices({
      getTabInfo: () => ({ path: tab.path, title: "Note" }),
    });
    const { rerender } = render(
      <InlineTitle tab={tab} services={services} renameEpoch={0} />,
    );
    expect(screen.getByRole("button")).toBeDefined();

    // Same epoch re-render (tab switch back, pre-existing signal): display.
    rerender(<InlineTitle tab={tab} services={services} renameEpoch={0} />);
    expect(screen.getByRole("button")).toBeDefined();

    // A newer epoch is the signal: enter edit with the name selected.
    rerender(<InlineTitle tab={tab} services={services} renameEpoch={1} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Note");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);
  });

  it("does not re-enter edit mode on remount with a pre-existing epoch", () => {
    const services = makeServices({
      getTabInfo: () => ({ path: tab.path, title: "Note" }),
    });
    // Mounted AFTER a signal already fired for this tab: the epoch seen at
    // mount is the baseline, so no spurious edit (tab switch, not a signal).
    const { rerender } = render(
      <InlineTitle tab={tab} services={services} renameEpoch={3} />,
    );
    expect(screen.getByRole("button")).toBeDefined();

    // Only a strictly newer epoch triggers the edit.
    rerender(<InlineTitle tab={tab} services={services} renameEpoch={4} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });
});
