import { createElement } from "react";
import { create } from "zustand";
import COMMANDS from "./commands.json";
import { resolveIcon } from "./icons";
import type { Command, CommandMetadata } from "./types";

interface CommandState {
  commands: Record<string, Command>;
  /** Register a command by id + callback. Metadata is looked up from commands.json. */
  registerCommand: (
    id: string,
    callback: () => void | Promise<void>,
    checkCallback?: () => boolean,
  ) => void;
  /** Register a full Command object (metadata + callback). Used by the store internally. */
  register: (cmd: Command) => void;
  unregister: (id: string) => void;
  execute: (id: string) => void;
  getCommands: () => Command[];
  getMetadata: () => CommandMetadata[];
}

export const useCommandStore = create<CommandState>((set, get) => ({
  commands: {},

  registerCommand: (id, callback, checkCallback) => {
    const meta = COMMANDS.find((c) => c.id === id);
    if (!meta) {
      console.warn(`Unknown command id: "${id}". Add it to commands.json.`);
      return;
    }
    const IconComponent = resolveIcon(meta.icon);
    const icon = IconComponent ? createElement(IconComponent, { size: 16 }) : undefined;
    get().register({ ...meta, icon, callback, checkCallback });
  },

  register: (cmd) =>
    set((state) => {
      if (state.commands[cmd.id]) {
        console.warn(`Command "${cmd.id}" is already registered. Overwriting.`);
      }
      return { commands: { ...state.commands, [cmd.id]: cmd } };
    }),

  unregister: (id) =>
    set((state) => {
      const next = { ...state.commands };
      delete next[id];
      return { commands: next };
    }),

  execute: (id) => {
    const cmd = get().commands[id];
    if (cmd && (!cmd.checkCallback || cmd.checkCallback())) {
      cmd.callback();
    }
  },

  getCommands: () => {
    return Object.values(get().commands).filter(
      (cmd) => !cmd.checkCallback || cmd.checkCallback(),
    );
  },

  getMetadata: () => COMMANDS,
}));
