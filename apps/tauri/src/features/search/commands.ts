import { commandService } from "@workspace/commands";
import { useSearchStore } from "./store";

commandService.registerCommand(
  "search:open",
  useSearchStore.getState().openSearch,
);
commandService.registerCommand(
  "switcher:open",
  useSearchStore.getState().openSwitcher,
);

export const unregister = commandService.unregister.bind(commandService);
