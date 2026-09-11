import { commandService } from "@workspace/commands";
import { useEffect } from "react";

import type { AppContextValue } from "./AppProvider";
import { openDailyNoteAt } from "./useCalendar";

/**
 * Registers vault-level commands that require runtime context (controller,
 * mutations, note-opening). Runs once per mount; unregisters on cleanup.
 */
export function useShellCommands(ws: AppContextValue) {
  const { openNote } = ws;
  useEffect(() => {
    /**
     * Daily notes (ADR-036): open today's note, creating it on first use.
     * Shared with the calendar dock — the date filename and template
     * expansion run entirely in TS; Rust only resolves + creates-if-missing.
     */
    const openToday = () => openDailyNoteAt(new Date(), openNote);

    commandService.registerCommand("dailies:open-today", openToday);
    commandService.registerCommand(
      "calendar:open-today",
      () => openDailyNoteAt(new Date(), openNote),
    );
    commandService.registerCommand(
      "app:new-file",
      ws.controller.createNoteInstant,
    );
    commandService.registerCommand(
      "app:new-canvas",
      ws.controller.createCanvasInstant,
    );
    commandService.registerCommand(
      "app:new-drawing",
      ws.controller.createDrawingInstant,
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
      commandService.unregister("dailies:open-today");
      commandService.unregister("calendar:open-today");
      commandService.unregister("app:new-file");
      commandService.unregister("app:new-canvas");
      commandService.unregister("app:new-drawing");
      commandService.unregister("app:delete-file");
      commandService.unregister("vault:pick-and-set");
    };
  }, [
    openNote,
    ws.controller.createNoteInstant,
    ws.controller.createCanvasInstant,
    ws.controller.createDrawingInstant,
    ws.controller.handleDeleteFromCommands,
    ws.mutations.pickAndSetVault,
  ]);
}
