import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useCommandRegistry } from "../../../editor/src/commands/context";
import { IconSearch, IconCommand } from "@tabler/icons-react";

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
            // Use requestAnimationFrame for a cleaner focus after opening
            const frame = requestAnimationFrame(() => {
                inputRef.current?.focus();
            });
            return () => cancelAnimationFrame(frame);
        }
    }, [isOpen]);

    const filteredCommands = useMemo(() => {
        const lowerQuery = query.toLowerCase();
        if (!lowerQuery) return commands;

        return commands.filter(cmd =>
            cmd.name.toLowerCase().includes(lowerQuery) ||
            cmd.category?.toLowerCase().includes(lowerQuery)
        );
    }, [query, commands]);

    // Reset selection when filter changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredCommands.length]);

    const handleSelect = useCallback((index: number) => {
        const cmd = filteredCommands[index];
        if (cmd) {
            execute(cmd.id);
            setIsOpen(false);
        }
    }, [filteredCommands, execute]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (filteredCommands.length === 0) return;

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
            {/* Reduced blur and increased opacity for better performance and visibility */}
            <div
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] pointer-events-auto transition-opacity duration-200"
                onClick={() => setIsOpen(false)}
            />

            <div className="w-full max-w-xl bg-slate-900 border border-slate-700 shadow-2xl rounded-xl overflow-hidden flex flex-col pointer-events-auto transform transition-all duration-200 scale-100">
                <div className="flex items-center px-4 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
                    <IconSearch className="w-5 h-5 text-slate-400 mr-3" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search commands..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder-slate-500 text-base"
                    />
                    <div className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        ESC
                    </div>
                </div>

                <div className="max-h-[50vh] overflow-y-auto py-2 custom-scrollbar">
                    {filteredCommands.length === 0 ? (
                        <div className="px-4 py-12 text-center">
                            <IconCommand className="w-8 h-8 text-slate-700 mx-auto mb-2 opacity-20" />
                            <div className="text-slate-500 text-sm">No commands found for "{query}"</div>
                        </div>
                    ) : (
                        filteredCommands.map((cmd, idx) => (
                            <CommandItem
                                key={cmd.id}
                                cmd={cmd}
                                isSelected={idx === selectedIndex}
                                onClick={() => handleSelect(idx)}
                                onMouseEnter={() => setSelectedIndex(idx)}
                            />
                        ))
                    )}
                </div>

                <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex gap-4">
                        <div className="flex items-center text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                            <span className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 mr-1.5 text-slate-300 font-bold">↑↓</span>
                            navigate
                        </div>
                        <div className="flex items-center text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                            <span className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 mr-1.5 text-slate-300 font-bold">Enter</span>
                            execute
                        </div>
                    </div>
                    <div className="text-[10px] font-black text-indigo-500/40 tracking-tighter italic">
                        BASALT CORE
                    </div>
                </div>
            </div>
        </div>
    );
};

interface CommandItemProps {
    cmd: any;
    isSelected: boolean;
    onClick: () => void;
    onMouseEnter: () => void;
}

const CommandItem: React.FC<CommandItemProps> = React.memo(({ cmd, isSelected, onClick, onMouseEnter }) => {
    return (
        <div
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            className={`px-3 py-2.5 mx-2 rounded-lg cursor-pointer flex items-center transition-colors duration-150 group ${isSelected ? "bg-indigo-600 shadow-lg shadow-indigo-600/20" : "hover:bg-slate-800/50"
                }`}
        >
            <div className={`w-8 h-8 rounded-md flex items-center justify-center mr-3 shrink-0 ${isSelected ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400 group-hover:text-slate-200"
                }`}>
                {cmd.icon ? (
                    <span className="flex items-center justify-center">{cmd.icon}</span>
                ) : (
                    <IconCommand className="w-4 h-4" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate ${isSelected ? "text-white" : "text-slate-200"}`}>
                    {cmd.name}
                </div>
                {cmd.category && (
                    <div className={`text-[10px] font-bold uppercase tracking-tight ${isSelected ? "text-indigo-100/70" : "text-slate-500"
                        }`}>
                        {cmd.category}
                    </div>
                )}
            </div>
            {cmd.hotkeys && cmd.hotkeys.length > 0 && (
                <div className="flex gap-1 ml-4 shrink-0">
                    {cmd.hotkeys.map((key: string) => (
                        <span key={key} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isSelected
                                ? "border-white/30 bg-white/10 text-white"
                                : "border-slate-700 bg-slate-800/50 text-slate-500"
                            }`}>
                            {key}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
});
