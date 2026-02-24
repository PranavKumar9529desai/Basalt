import React from "react";

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

export class CommandRegistry {
    private commands: Map<string, Command> = new Map();
    private listeners: Set<() => void> = new Set();

    register(command: Command) {
        if (this.commands.has(command.id)) {
            console.warn(`Command "${command.id}" is already registered. Overwriting.`);
        }
        this.commands.set(command.id, command);
        this.notify();
        return () => this.unregister(command.id);
    }

    unregister(id: string) {
        if (this.commands.delete(id)) {
            this.notify();
        }
    }

    getCommands(): Command[] {
        return Array.from(this.commands.values()).filter(cmd =>
            !cmd.checkCallback || cmd.checkCallback()
        );
    }

    private notify() {
        this.listeners.forEach(listener => listener());
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

export const globalCommandRegistry = new CommandRegistry();
