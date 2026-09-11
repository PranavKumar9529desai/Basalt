import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IconSearch, IconFileText, IconX } from "@tabler/icons-react";
import { segmentsOf } from "@workspace/ui";
import { Button } from "@workspace/ui/components/ui/button";
import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";

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
      }
    },
    [notes, selectedIndex, onSelect, onClose],
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        overlayClassName="bg-black/50 backdrop-blur-xs"
        showCloseButton={false}
        aria-label="Pick note"
        className="flex w-full flex-col overflow-hidden rounded-xl border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)] p-0 shadow-2xl sm:max-w-lg"
      >
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <IconX size={16} />
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {notes.length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--sat-text-muted)]">
              No matching notes found
            </div>
          ) : (
            notes.map((note, index) => {
              const isSelected = index === selectedIndex;
              return (
                <Button
                  key={note.path}
                  type="button"
                  variant="ghost"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors h-auto ${
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
                </Button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
