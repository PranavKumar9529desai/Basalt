//! Presentational form fields for the task modal. Each field is a dumb
//! component: values/options in via props, changes out via callbacks — the
//! modal keeps all state and submit logic in the index.

import { IconChevronDown, IconX } from "@tabler/icons-react";
import { Select } from "@base-ui/react/select";
import type { KeyboardEvent, RefObject } from "react";
import { Input } from "@workspace/ui/components/ui/input";
import type { SelectOption } from "./options";

interface LabeledSelectProps {
  id: string;
  label?: string;
  value: string;
  onValueChange: (v: string) => void;
  options: readonly SelectOption[];
}

/** Label + single-select with the shared popup styling. */
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
        <label
          htmlFor={id}
          className="text-xs font-medium text-[var(--sat-text-secondary)]"
        >
          {label}
        </label>
      )}
      <Select.Root
        value={value}
        onValueChange={(v) => {
          if (v !== null) onValueChange(v);
        }}
        items={options}
      >
        <Select.Trigger
          id={id}
          className="flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2.5 text-xs text-[var(--sat-text-primary)] hover:border-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)] focus:outline-none cursor-pointer"
        >
          <Select.Value />
          <Select.Icon>
            <IconChevronDown
              size={12}
              className="flex-shrink-0 text-[var(--sat-text-muted)]"
            />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} align="start">
            <Select.Popup className="z-50 min-w-[160px] rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] p-1 shadow-2xl">
              <Select.List>
                {options.map((o) => (
                  <Select.Item
                    key={o.value}
                    value={o.value}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs text-[var(--sat-text-secondary)] data-[highlighted]:bg-[var(--sat-surface-3)] data-[highlighted]:text-[var(--sat-text-primary)] data-[selected]:text-[var(--sat-accent-primary)] select-none outline-none"
                  >
                    <Select.ItemText>{o.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
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
      <label
        htmlFor="task-description"
        className="text-xs font-medium text-[var(--sat-text-secondary)]"
      >
        Description
      </label>
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
      <label
        htmlFor={`task-${label.toLowerCase()}`}
        className="text-xs font-medium text-[var(--sat-text-secondary)]"
      >
        {label}
      </label>
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

/** Tag chips + the add-tag input (Enter adds, empty Backspace pops). */
export function TagField({
  tags,
  onRemove,
  input,
  onInputChange,
  onInputKeyDown,
}: TagFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="task-tag-input"
        className="text-xs font-medium text-[var(--sat-text-secondary)]"
      >
        Tags
      </label>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)] px-2 py-0.5 text-[11px] text-[var(--sat-text-secondary)]"
            >
              #{tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onRemove(tag)}
                className="text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
              >
                <IconX size={11} />
              </button>
            </span>
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