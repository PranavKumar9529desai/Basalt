import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { Command, CommandRegistry, globalCommandRegistry } from "./registry";

interface CommandContextValue {
    registry: CommandRegistry;
    commands: Command[];
    execute: (id: string) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

export const CommandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [commands, setCommands] = useState<Command[]>(() => globalCommandRegistry.getCommands());

    useEffect(() => {
        // Update local state when registry changes
        return globalCommandRegistry.subscribe(() => {
            setCommands(globalCommandRegistry.getCommands());
        });
    }, []);

    const value = useMemo(() => ({
        registry: globalCommandRegistry,
        commands,
        execute: (id: string) => {
            const cmd = globalCommandRegistry.getCommands().find(c => c.id === id);
            if (cmd) {
                cmd.callback();
            }
        }
    }), [commands]);

    return (
        <CommandContext.Provider value={value}>
            {children}
        </CommandContext.Provider>
    );
};

export const useCommandRegistry = () => {
    const ctx = useContext(CommandContext);
    if (!ctx) throw new Error("useCommandRegistry must be used within a CommandProvider");
    return ctx;
};

/**
 * Hook to register a command when a component is mounted.
 * Automatically unregisters when the component unmounts.
 */
export const useCommand = (command: Command | null) => {
    const { registry } = useCommandRegistry();

    useEffect(() => {
        if (!command) return;
        return registry.register(command);
    }, [command, registry]);
};
