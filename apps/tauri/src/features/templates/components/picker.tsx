import {
  HighlightedText,
  PaletteShell,
  PaletteShellFooter,
  PaletteShellHeader,
} from "@workspace/ui/components/palette-shell";
import { Button } from "@workspace/ui/components/ui/button";
import { useCallback, useEffect, useRef } from "react";

import { insertTemplate } from "../commands";
import { filterTemplates, useTemplatePickerStore } from "../picker-store";

function TemplateRow({
  name,
  query,
  isSelected,
  onClick,
}: {
  name: string;
  query: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const displayName = name.replace(/\.md$/i, "");
  return (
    <Button
      // Custom role on a Button — not a native <option>.
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="option"
      aria-selected={isSelected}
      variant="ghost"
      tabIndex={-1}
      className={[
        "w-full justify-start gap-2.5 px-4 py-2 h-auto rounded-md",
        isSelected
          ? "bg-accent text-accent-foreground *:[svg]:text-accent-foreground"
          : "",
      ].join(" ")}
      onClick={onClick}
    >
      <span className="text-sm font-medium truncate">
        <HighlightedText text={displayName} query={query} />
      </span>
    </Button>
  );
}

/**
 * Template picker modal (ADR-036). Lists templates from the configured
 * template folder; confirming inserts the expanded template at the cursor in
 * the active editor.
 */
export function TemplatePicker() {
  const {
    isOpen,
    templates,
    query,
    selectedIndex,
    isLoading,
    error,
    close,
    setQuery,
    selectNext,
    selectPrev,
  } = useTemplatePickerStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const filtered = filterTemplates(templates, query);

  // Focus input when modal opens.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Keep the selected row visible without stealing focus from the input.
  useEffect(() => {
    const el = resultsRef.current?.querySelector('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, filtered.length, isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectNext();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectPrev();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const name = filtered[selectedIndex];
        if (name) {
          close();
          void insertTemplate(name);
        }
      } else if (e.key === "Escape") {
        close();
      }
    },
    [filtered, selectedIndex, close, selectNext, selectPrev],
  );

  return (
    <PaletteShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      maxWidth="sm:max-w-[600px]"
    >
      <PaletteShellHeader
        inputRef={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Insert template…"
        isLoading={isLoading}
        inputProps={{
          role: "combobox",
          "aria-expanded": filtered.length > 0,
          "aria-controls": "template-picker-results",
          "aria-activedescendant": filtered[selectedIndex]
            ? `template-${selectedIndex}`
            : undefined,
          "aria-autocomplete": "list",
        }}
      />
      <div
        ref={resultsRef}
        id="template-picker-results"
        // Virtualized rows require an ARIA listbox container rather than native select.
        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="listbox"
        aria-label="Templates"
        className="max-h-[320px] overflow-y-auto px-2"
      >
        {error ? (
          <p className="px-4 py-3 text-sm text-[var(--sat-state-error)]">
            {error}
          </p>
        ) : filtered.length === 0 && !isLoading ? (
          <p className="px-4 py-3 text-sm text-[var(--sat-text-muted)]">
            No templates yet — add Markdown files to your template folder
          </p>
        ) : (
          filtered.map((name, i) => (
            <TemplateRow
              key={name}
              name={name}
              isSelected={i === selectedIndex}
              query={query}
              onClick={() => {
                close();
                void insertTemplate(name);
              }}
            />
          ))
        )}
      </div>

      <PaletteShellFooter />
    </PaletteShell>
  );
}