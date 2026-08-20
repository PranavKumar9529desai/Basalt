import { create } from "zustand";
import { commandService } from "./service";
import type { Command, CommandMetadata } from "./types";

interface CommandState {
  commands: Record<string, Command>;
  registerCommand: (
    id: string,
    callback: () => void | Promise<void>,
    checkCallback?: () => boolean,
  ) => void;
  register: (cmd: Command) => void;
  unregister: (id: string) => void;
  execute: (id: string) => void;
  getCommands: () => Command[];
  getMetadata: () => CommandMetadata[];
}

function snapshot(): Record<string, Command> {
  const record: Record<string, Command> = {};
  for (const cmd of commandService.getCommands()) {
    record[cmd.id] = cmd;
  }
  return record;
}

export const useCommandStore = create<CommandState>((set) => ({
  commands: {},

  registerCommand: (id, callback, checkCallback) => {
    commandService.registerCommand(id, callback, checkCallback);
    set({ commands: snapshot() });
  },

  register: (cmd) => {
    commandService.register(cmd);
    set({ commands: snapshot() });
  },

  unregister: (id) => {
    commandService.unregister(id);
    set({ commands: snapshot() });
  },

  execute: (id) => commandService.execute(id),

  getCommands: () => commandService.getCommands(),

  getMetadata: () => commandService.getMetadata(),
}));
