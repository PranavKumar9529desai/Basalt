import { useCommandStore } from "@workspace/commands";
import { useSettingsStore } from "./store";

const { registerCommand } = useCommandStore.getState();

registerCommand("app:open-settings", useSettingsStore.getState().open);
