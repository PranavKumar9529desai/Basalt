import { useState } from "react";
import { Input } from "@workspace/ui/components/ui/input";
import { Button } from "@workspace/ui/components/ui/button";
import { editFrontmatter, useFrontmatter } from "../../features/editor";
import type {
  FrontmatterDiagnostic,
  FrontmatterEntry,
  FrontmatterValue,
} from "@workspace/editor";

function displayValue(v: FrontmatterValue): string {
  if (typeof v === "string") return "";
  if ("Text" in v) return v.Text;
  if ("Link" in v) return `[[${v.Link}]]`;
  if ("Number" in v) return String(v.Number);
  if ("Checkbox" in v) return (v.Checkbox ? "true" : "false");
  if ("Date" in v) return v.Date;
  if ("DateTime" in v) return v.DateTime;
  if ("List" in v) return v.List.map(displayValue).join(", ");
  return "";
}

function parseValue(text: string): FrontmatterValue {
  const t = text.trim();
  if (t === "") return "None";
  if (/^-?\d+(\.\d+)?$/.test(t)) return { Number: Number(t) };
  if (t === "true" || t === "false") return { Checkbox: t === "true" };
  const link = t.match(/^\[\[(.+)\]\]$/);
  if (link) return { Link: link[1] };
  return { Text: t };
}

function isCheckboxValue(v: FrontmatterValue): v is { Checkbox: boolean } {
  return typeof v !== "string" && "Checkbox" in v;
}

/**
 * Properties view — the right dock's registered view (ADR-018). Renders the
 * typed frontmatter model and edits it surgically via `editFrontmatter`,
 * which replaces only the value span in the active editor. Diagnostics are
 * shown but never block editing (ADR-022 rule 3).
 */
export function PropertiesView() {
  const model = useFrontmatter((s) => s.model);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  if (!model) {
    return (
      <div className="p-3 text-sm text-[var(--sat-text-muted)]">
        No frontmatter.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      {model.entries.map((entry: FrontmatterEntry) => (
        <div key={entry.key} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[var(--sat-text-muted)]">
            {entry.key}
          </span>
          {isCheckboxValue(entry.value) ? (
            <input
              type="checkbox"
              checked={entry.value.Checkbox}
              onChange={(e) =>
                editFrontmatter(entry.key, { Checkbox: e.target.checked })
              }
              className="h-4 w-4 accent-[var(--sat-accent-primary)]"
            />
          ) : (
            <Input
              defaultValue={displayValue(entry.value)}
              onBlur={(e) => editFrontmatter(entry.key, parseValue(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="h-7 flex-1"
            />
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => editFrontmatter(entry.key, undefined)}
            className="px-2"
            aria-label={`Remove ${entry.key}`}
          >
            ✕
          </Button>
        </div>
      ))}

      {model.diagnostics.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {model.diagnostics.map((d: FrontmatterDiagnostic, i) => (
            <div key={i} className="text-xs text-[var(--sat-state-warning)]">
              {d.message}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 border-t border-[var(--sat-layout-border)] pt-2">
        <Input
          placeholder="key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="h-7 w-28"
        />
        <Input
          placeholder="value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newKey.trim()) {
              editFrontmatter(newKey.trim(), parseValue(newValue));
              setNewKey("");
              setNewValue("");
            }
          }}
          className="h-7 flex-1"
        />
      </div>
    </div>
  );
}
