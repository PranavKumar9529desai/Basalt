import { invoke } from "@tauri-apps/api/core";
import { commandService } from "@workspace/commands";
import { useEffect } from "react";

import { getSetting } from "../features/settings";
import { expandTemplate, formatDate } from "../features/templates";
import type { AppContextValue } from "./AppProvider";
import { stemOf } from "@workspace/ui";

/**
 * Registers vault-level commands that require runtime context (controller,
 * mutations, note-opening). Runs once per mount; unregisters on cleanup.
 */
export function useShellCommands(ws: AppContextValue) {
  const { openNote } = ws;
  useEffect(() => {
    /**
     * Daily notes (ADR-036): open today's note, creating it on first use.
     * The date filename and template expansion run entirely in TS — Rust only
     * resolves the folder and creates-if-missing.
     */
    const openToday = async () => {
      const now = new Date();
      const folder = getSetting("dailyNotesFolder");
      const dateFormat = getSetting("dailyNoteDateFormat");
      const template = getSetting("dailyNoteTemplate");
      const fileName = formatDate(now, dateFormat);
      const title = stemOf(fileName) || fileName;

      let content = "";
      if (template) {
        try {
          const raw = await invoke<string>("read_template", { name: template });
          content = expandTemplate(raw, { title, now });
        } catch (err) {
          console.warn(
            `Daily template "${template}" could not be read; creating a blank note.`,
            err,
          );
        }
      }

      const result = await invoke<{ path: string; name: string }>(
        "open_daily_note",
        { parent: folder, name: fileName, content },
      );
      openNote(result.path);
    };

    commandService.registerCommand("dailies:open-today", openToday);
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
