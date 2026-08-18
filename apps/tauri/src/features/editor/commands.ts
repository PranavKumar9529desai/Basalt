import { useCommandStore } from "@workspace/commands";

const { registerCommand } = useCommandStore.getState();

registerCommand("app:extract-selection", () => {
  // TODO: implement extract selection to new note
});
