import type React from "react";
import { create } from "zustand";

export interface Command {
    id: string;
    name: string;
    description?: string;
    icon?: React.ReactNode;
    category?: string;
    hotkeys?: string[];
    callback: () => void | Promise<void>;
    checkCallback?: () => boolean;
}

interface CommandState {
    commands: Record<string, Command>;
    register: (cmd: Command) => void;
    unregister: (id: string) => void;
    execute: (id: string) => void;
    getCommands: () => Command[];
}

export const useCommandStore = create<CommandState>((set, get) => ({
    commands: {},
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
            (cmd) => !cmd.checkCallback || cmd.checkCallback()
        );
    },
}));
