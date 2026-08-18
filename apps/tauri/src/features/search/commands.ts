import { useCommandStore } from "@workspace/commands";
import { useSearchStore } from "./store";

const { registerCommand, unregister } = useCommandStore.getState();

registerCommand("search:open", useSearchStore.getState().openSearch);
registerCommand("switcher:open", useSearchStore.getState().openSwitcher);

export { unregister };
