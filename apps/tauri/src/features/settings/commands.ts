import { commandService } from "@workspace/commands";
import { useSettingsModalStore } from "./store";

commandService.registerCommand("app:open-settings", useSettingsModalStore.getState().open);
