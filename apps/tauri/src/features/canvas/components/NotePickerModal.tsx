import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IconSearch, IconFileText, IconX } from "@tabler/icons-react";
import { segmentsOf } from "@workspace/ui";

interface NoteSuggestion {
  name: string;
  path: string;
}

interface NotePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (note: { name: string; path: string }) => void;
}

export function NotePickerModal({
  isOpen,
  onClose,
  onSelect,
}: NotePickerModalProps) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    let isMounted = true;
    invoke<NoteSuggestion[]>("autocomplete_links", { prefix: query.trim() })
      .then((results) => {
        if (isMounted) {
          setNotes(results || []);
          setSelectedIndex(0);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch note suggestions:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          notes.length > 0 ? (prev + 1) % notes.length : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          notes.length > 0 ? (prev - 1 + notes.length) % notes.length : 0,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (notes[selectedIndex]) {
          onSelect(notes[selectedIndex]);
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [notes, selectedIndex, onSelect, onClose],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close modal"
        className="fixed inset-0 bg-black/50 backdrop-blur-xs cursor-default w-full h-full border-0 p-0"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)] shadow-2xl overflow-hidden flex flex-col">
        {/* Search header */}
        <div className="flex items-center px-4 py-3 border-b border-[var(--sat-layout-border)] gap-2">
          <IconSearch
            size={18}
            className="text-[var(--sat-text-muted)] shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-[var(--sat-text-primary)] placeholder-[var(--sat-text-muted)] outline-none text-sm"
            placeholder="Search note to add to canvas..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)]"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Results list */}
        <div className="max-h-72 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {notes.length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--sat-text-muted)]">
              No matching notes found
            </div>
          ) : (
            notes.map((note, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={note.path}
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground font-medium *:[svg]:text-accent-foreground"
                      : "text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-2)] hover:text-[var(--sat-text-primary)]"
                  }`}
                  onClick={() => {
                    onSelect(note);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <IconFileText
                    size={16}
                    className="text-[var(--sat-accent-primary)] shrink-0"
                  />
                  <span className="truncate flex-1">
                    {note.name.replace(/\.md$/, "")}
                  </span>
                  <span className="text-xs text-[var(--sat-text-muted)] truncate max-w-[140px]">
                    {segmentsOf(note.path).slice(-2).join("/")}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
