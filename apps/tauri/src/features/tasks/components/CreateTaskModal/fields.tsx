//! Presentational form fields for the task modal. Built entirely on shadcn
//! primitives (ui/select, ui/input, ui/label, ui/badge — ADR-003): values/
//! options in via props, changes out via callbacks — the modal keeps all
//! state and submit logic in the index.

import { IconChevronDown, IconX } from "@tabler/icons-react";
import type { KeyboardEvent, RefObject } from "react";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import {
  SelectIcon,
  SelectItem,
  SelectItemText,
  SelectList,
  SelectPopup,
  SelectPositioner,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import type { SelectOption } from "./options";

interface LabeledSelectProps {
  id: string;
  label?: string;
  value: string;
  onValueChange: (v: string) => void;
  options: readonly SelectOption[];
}

/** Label + single-select from the shared shadcn Select primitive. */
export function LabeledSelect({
  id,
  label,
  value,
  onValueChange,
  options,
}: LabeledSelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label !== undefined && (
        <Label htmlFor={id}>
          {label}
        </Label>
      )}
      <SelectRoot
        value={value}
        onValueChange={(v) => {
          // Base UI reports null when the selection is cleared — ignore it.
          if (v !== null) onValueChange(v);
        }}
        items={options}
      >
        <SelectTrigger id={id}>
          <SelectValue />
          <SelectIcon>
            <IconChevronDown size={12} />
          </SelectIcon>
        </SelectTrigger>
        <SelectPortal>
          <SelectPositioner sideOffset={4} align="start">
            <SelectPopup>
              <SelectList>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <SelectItemText>{o.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectList>
            </SelectPopup>
          </SelectPositioner>
        </SelectPortal>
      </SelectRoot>
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
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onRemove(tag)}
                className="cursor-pointer text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
              >
                <IconX size={11} />
              </button>
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