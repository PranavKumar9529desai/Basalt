import React, { useEffect, useState, useMemo, useRef } from "react";
import { useCommandRegistry } from "../commands/context";
import { IconSearch, IconCommand } from "@tabler/icons-react";

// For now, we'll use a simple modal as we don't have shadcn command component.
// We'll simulate the Rust-powered search if WASM is available, or use JS fallback.

export const CommandPalette: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { commands, execute } = useCommandRegistry();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key.toLowerCase() === "p") {
                e.preventDefault();
                setIsOpen(prev => !prev);
            } else if (e.key === "Escape") {
                setIsOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [isOpen]);

    // Perform fuzzy search (In a real scenario, this would call the Rust/WASM function)
    const filteredCommands = useMemo(() => {
        if (!query) return commands;

        // Simulating the fuzzy matching here for the immediate demo, 
        // but the architecture allows offloading this to Rust Basalt.wasm
        return commands.filter(cmd =>
            cmd.name.toLowerCase().includes(query.toLowerCase()) ||
            cmd.category?.toLowerCase().includes(query.toLowerCase())
        );
    }, [query, commands]);

    const handleSelect = (index: number) => {
        const cmd = filteredCommands[index];
        if (cmd) {
            execute(cmd.id);
            setIsOpen(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            handleSelect(selectedIndex);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
            <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm pointer-events-auto" onClick={() => setIsOpen(false)} />

            <div className="w-full max-w-xl bg-slate-900 border border-slate-700 shadow-2xl rounded-xl overflow-hidden flex flex-col pointer-events-auto">
                <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-slate-900">
                    <IconSearch className="w-5 h-5 text-slate-400 mr-3" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search commands..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder-slate-500 text-sm"
                    />
                    <div className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        ESC
                    </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto pt-2 pb-2">
                    {filteredCommands.length === 0 ? (
                        <div className="px-4 py-8 text-center text-slate-500 text-sm">
                            No commands found.
                        </div>
                    ) : (
                        filteredCommands.map((cmd, idx) => (
                            <div
                                key={cmd.id}
                                onClick={() => handleSelect(idx)}
                                onMouseEnter={() => setSelectedIndex(idx)}
                                className={`px-3 py-2.5 mx-2 rounded-lg cursor-pointer flex items-center group ${idx === selectedIndex ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-md flex items-center justify-center mr-3 ${idx === selectedIndex ? "bg-indigo-500" : "bg-slate-800 text-slate-400"
                                    }`}>
                                    {cmd.icon || <IconCommand className="w-4 h-4" />}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <div className="text-sm font-medium truncate">{cmd.name}</div>
                                    {cmd.category && (
                                        <div className={`text-[10px] uppercase tracking-wider ${idx === selectedIndex ? "text-indigo-200" : "text-slate-500"
                                            }`}>
                                            {cmd.category}
                                        </div>
                                    )}
                                </div>
                                {cmd.hotkeys && cmd.hotkeys.length > 0 && (
                                    <div className="flex gap-1 ml-2">
                                        {cmd.hotkeys.map(key => (
                                            <span key={key} className={`text-[10px] font-mono px-1 rounded border ${idx === selectedIndex ? "border-indigo-400/30 bg-indigo-500/50" : "border-slate-700 bg-slate-800 text-slate-500"
                                                }`}>
                                                {key}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="px-4 py-2 bg-slate-950/50 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex gap-4">
                        <div className="flex items-center text-[10px] text-slate-500 uppercase tracking-tighter">
                            <span className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 mr-1 text-slate-400">↑↓</span>
                            to navigate
                        </div>
                        <div className="flex items-center text-[10px] text-slate-500 uppercase tracking-tighter">
                            <span className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 mr-1 text-slate-400">Enter</span>
                            to run
                        </div>
                    </div>
                    <div className="text-[10px] font-bold text-indigo-500/50 italic select-none">
                        BASALT CORE
                    </div>
                </div>
            </div>
        </div>
    );
};
