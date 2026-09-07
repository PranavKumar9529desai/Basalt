import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { useSearchStore } from "../store";
import { QuickSwitcher } from "./QuickSwitcher";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("QuickSwitcher create row", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    useSearchStore.setState({
      isSwitcherOpen: false,
      switcherQuery: "",
      switcherResults: [],
      switcherSelectedIndex: 0,
      switcherCanCreate: false,
      isSwitcherLoading: false,
      switcherError: null,
    });
  });

  it("renders the create row when the query matches no file", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    act(() => {
      useSearchStore.getState().openSwitcher();
      useSearchStore.getState().setSwitcherQuery("beta");
    });
    render(<QuickSwitcher onOpen={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByText(/Create new note:/)).toBeInTheDocument();
  });

  it("Enter on the create row creates the note and closes on success", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const onOpen = vi.fn();
    vi.mocked(invoke).mockResolvedValue([]);
    act(() => {
      useSearchStore.getState().openSwitcher();
      useSearchStore.getState().setSwitcherQuery("beta");
    });
    render(<QuickSwitcher onOpen={onOpen} onCreate={onCreate} />);
    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onCreate).toHaveBeenCalledWith("beta");
    expect(onOpen).not.toHaveBeenCalled();
    expect(useSearchStore.getState().isSwitcherOpen).toBe(false);
  });

  it("shows an error and stays open when creation fails", async () => {
    const onCreate = vi.fn().mockResolvedValue(false);
    vi.mocked(invoke).mockResolvedValue([]);
    act(() => {
      useSearchStore.getState().openSwitcher();
      useSearchStore.getState().setSwitcherQuery("beta");
    });
    render(<QuickSwitcher onOpen={vi.fn()} onCreate={onCreate} />);
    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(screen.getByText("Could not create note")).toBeInTheDocument();
    expect(useSearchStore.getState().isSwitcherOpen).toBe(true);
  });
});