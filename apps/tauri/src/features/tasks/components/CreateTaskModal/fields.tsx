//! Presentational form fields for the task modal. Built entirely on shadcn
//! primitives (ui/select, ui/input, ui/label, ui/badge — ADR-003): values/
//! options in via props, changes out via callbacks — the modal keeps all
//! state and submit logic in the index.

import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import type { KeyboardEvent, RefObject } from "react";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Button } from "@workspace/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { cn } from "@workspace/ui/lib/utils";
import type { SelectOption } from "./options";

interface LabeledSelectProps {
  id: string;
  label?: string;
  value: string;
  onValueChange: (v: string) => void;
  options: readonly SelectOption[];
  /** Grid classes on the wrapper — lets a row pair/layout dropdowns. */
  className?: string;
}

/**
 * Label + single-select dropdown. Built on the shadcn DropdownMenu (base-ui
 * Menu) rather than the Select primitive — a click-to-open menu is the
 * dependable single-select primitive inside a modal (the Select popup and the
 * dialog's focus/portal layers fight in the desktop WebView, and base-ui
 * Select ties a popup to a hidden input). Controlled: selected option is
 * checked; trigger mirrors a select control's chrome.
 */
export function LabeledSelect({
  id,
  label,
  value,
  onValueChange,
  options,
  className,
}: LabeledSelectProps) {
  const selected = options.find((o) => o.value === value);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label !== undefined && <Label htmlFor={id}>{label}</Label>}
      <DropdownMenu>
        <DropdownMenuTrigger
          id={id}
          className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2.5 text-xs text-[var(--sat-text-primary)] outline-none transition-colors hover:border-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        >
          <span
            className={cn(
              "truncate",
              selected === undefined && "text-[var(--sat-text-muted)]",
            )}
          >
            {selected?.label ?? "Select…"}
          </span>
          <IconChevronDown
            size={12}
            className="flex-shrink-0 text-[var(--sat-text-muted)]"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4}>
          {options.map((o) => (
            <DropdownMenuItem
              key={o.value}
              onClick={() => onValueChange(o.value)}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && (
                <IconCheck
                  size={12}
                  className="ml-auto flex-shrink-0 text-[var(--sat-accent-primary)]"
                />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface DescriptionFieldProps {
  ref: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
}

export function DescriptionField({
  ref,
  value,
  onChange,
}: DescriptionFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="task-description">Description</Label>
      <Input
        id="task-description"
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Task description"
      />
    </div>
  );
}

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

/** One `<input type="date">` cell of the three-column date grid. */
export function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <div key={label} className="flex flex-col gap-1.5">
      <Label htmlFor={`task-${label.toLowerCase()}`}>{label}</Label>
      <Input
        id={`task-${label.toLowerCase()}`}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface RecurrenceFieldProps {
  preset: string;
  onPresetChange: (v: string) => void;
  custom: string;
  onCustomChange: (v: string) => void;
  presets: readonly SelectOption[];
}

/** Recurrence preset select + the custom-rule input shown for "No recurrence". */
export function RecurrenceField({
  preset,
  onPresetChange,
  custom,
  onCustomChange,
  presets,
}: RecurrenceFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <LabeledSelect
        id="task-recurrence"
        label="Recurrence"
        value={preset}
        onValueChange={onPresetChange}
        options={presets}
      />
      {preset === "" && (
        <Input
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="Custom rule, e.g. every 3 days"
          className="mt-1.5"
        />
      )}
    </div>
  );
}

interface TagFieldProps {
  tags: string[];
  onRemove: (tag: string) => void;
  input: string;
  onInputChange: (v: string) => void;
  onInputKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/** Tag chips (shadcn Badge) + the add-tag input (Enter adds, empty Backspace pops). */
export function TagField({
  tags,
  onRemove,
  input,
  onInputChange,
  onInputKeyDown,
}: TagFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="task-tag-input">Tags</Label>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag}>
              #{tag}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onRemove(tag)}
                className="text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
              >
                <IconX size={11} />
              </Button>
            </Badge>
          ))}
        </div>
        <Input
          id="task-tag-input"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Type a tag and press Enter"
        />
      </div>
    </div>
  );
}
