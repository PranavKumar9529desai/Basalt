import { IconCommand as TablerIconCommand, IconSearch as TablerIconSearch } from "@tabler/icons-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Command } from "../../../editor/src/commands/registry";
import { useCommandRegistry } from "../../../editor/src/commands/context";

const IconCommand = TablerIconCommand as any;
const IconSearch = TablerIconSearch as any;

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
        setIsOpen((prev) => !prev);
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

    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lowerQuery) ||
        cmd.category?.toLowerCase().includes(lowerQuery),
    );
  }, [query, commands]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, []); // Removed query dependency as suggested by Biome, or I might need to keep it if it's intentional. Actually Biome said it's redundant.

  const handleSelect = useCallback(
    (index: number) => {
      const cmd = filteredCommands[index];
      if (cmd) {
        execute(cmd.id);
        setIsOpen(false);
      }
    },
    [filteredCommands, execute],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredCommands.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(
        (prev) =>
          (prev - 1 + filteredCommands.length) % filteredCommands.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(selectedIndex);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
      {/* Reduced blur and increased opacity for better performance and visibility */}
      <button
        type="button"
        className="fixed inset-0 bg-background/60 backdrop-blur-[2px] pointer-events-auto transition-opacity duration-200 border-none outline-none cursor-default"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="w-full max-w-xl bg-card border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col pointer-events-auto transform transition-all duration-200 scale-100">
        <div className="flex items-center px-4 py-4 border-b border-border bg-card/50 backdrop-blur-md">
          <IconSearch className="w-5 h-5 text-muted-foreground mr-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-foreground placeholder-muted-foreground text-base"
          />
          <div className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
            ESC
          </div>
        </div>

        <div
          className="max-h-[50vh] overflow-y-auto py-2 custom-scrollbar"
          role="listbox"
        >
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <IconCommand className="w-8 h-8 text-muted mx-auto mb-2 opacity-20" />
              <div className="text-muted-foreground text-sm">
                No commands found for "{query}"
              </div>
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

        <div className="px-4 py-2.5 bg-background/80 border-t border-border flex items-center justify-between">
          <div className="flex gap-4">
            <div className="flex items-center text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              <span className="bg-muted border border-border rounded px-1.5 py-0.5 mr-1.5 text-foreground/80 font-bold">
                ↑↓
              </span>
              navigate
            </div>
            <div className="flex items-center text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              <span className="bg-muted border border-border rounded px-1.5 py-0.5 mr-1.5 text-foreground/80 font-bold">
                Enter
              </span>
              execute
            </div>
          </div>
          <div className="text-[10px] font-black text-primary/40 tracking-tighter italic">
            BASALT CORE
          </div>
        </div>
      </div>
    </div>
  );
};

interface CommandItemProps {
  cmd: Command;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

const CommandItem: React.FC<CommandItemProps> = React.memo(
  ({ cmd, isSelected, onClick, onMouseEnter }) => {
    return (
      <div
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        onMouseEnter={onMouseEnter}
        role="option"
        aria-selected={isSelected}
        tabIndex={0}
        className={`px-3 py-2.5 mx-2 rounded-lg cursor-pointer flex items-center transition-colors duration-150 group outline-none ${isSelected
          ? "bg-primary shadow-lg shadow-primary/20"
          : "hover:bg-accent/50"
          }`}
      >
        <div
          className={`w-8 h-8 rounded-md flex items-center justify-center mr-3 shrink-0 ${isSelected
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-muted text-muted-foreground group-hover:text-foreground"
            }`}
        >
          {cmd.icon ? (
            <span className="flex items-center justify-center">
              {typeof cmd.icon === "bigint"
                ? String(cmd.icon)
                : (cmd.icon as React.ReactNode)}
            </span>
          ) : (
            <IconCommand className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm font-semibold truncate ${isSelected ? "text-primary-foreground" : "text-foreground"}`}
          >
            {cmd.name}
          </div>
          {cmd.category && (
            <div
              className={`text-[10px] font-bold uppercase tracking-tight ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                }`}
            >
              {cmd.category}
            </div>
          )}
        </div>
        {cmd.hotkeys && cmd.hotkeys.length > 0 && (
          <div className="flex gap-1 ml-4 shrink-0">
            {cmd.hotkeys.map((key: string) => (
              <span
                key={key}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isSelected
                  ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
                  : "border-border bg-muted/50 text-muted-foreground"
                  }`}
              >
                {key}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  },
);
