import { commandService } from "@workspace/commands";
import { useTabsStore } from "../features/tabs";

// Open the note-link graph as a full workbench leaf (ADR-018), mirroring how
// Obsidian opens its graph view. The leaf is registered in
// app-shell/viewRegistrations.ts; this just drives it from the command
// palette / keybindings.
commandService.registerCommand("graph:open", () => {
  useTabsStore.getState().openView("graph", { title: "Graph" });
});
