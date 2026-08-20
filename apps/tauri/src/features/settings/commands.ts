import { commandService } from "@workspace/commands";
import { useSettingsStore } from "./store";

commandService.registerCommand("app:open-settings", useSettingsStore.getState().open);
