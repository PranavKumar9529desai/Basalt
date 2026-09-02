import { commandService } from "@workspace/commands";
import { useEffect } from "react";

import type { AppContextValue } from "./AppProvider";

/**
 * Registers vault-level commands that require runtime context (controller,
 * mutations). Runs once per mount; unregisters on cleanup.
 */
export function useShellCommands(ws: AppContextValue) {
  useEffect(() => {
    commandService.registerCommand(
      "app:new-file",
      ws.controller.createNoteInstant,
    );
    commandService.registerCommand(
      "app:delete-file",
      ws.controller.handleDeleteFromCommands,
    );
    commandService.registerCommand(
      "vault:pick-and-set",
      ws.mutations.pickAndSetVault,
    );
    return () => {
      commandService.unregister("app:new-file");
      commandService.unregister("app:delete-file");
      commandService.unregister("vault:pick-and-set");
    };
  }, [
    ws.controller.createNoteInstant,
    ws.controller.handleDeleteFromCommands,
    ws.mutations.pickAndSetVault,
  ]);
}
