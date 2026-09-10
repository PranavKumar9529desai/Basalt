/**
 * CreateTaskModal — create/edit task form (ADR-048 §5 / §7.1).
 *
 * Create mode: empty form; `create_task` appends a checkbox line to the
 * active note, then `onTaskCreated` navigates to the new line.
 * Edit mode: form hydrated from `get_task_line`; `update_task` rewrites the
 * line in place (the CM6 doc is replaced via save flow, never patched here).
 *
 * Props are injected from the shell (Shell → Overlays) so this feature never
 * imports across feature boundaries (AGENTS.md §3).
 */
import { IconChevronDown, IconX } from "@tabler/icons-react";
import { Select } from "@base-ui/react/select";
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";

import { useTaskActions } from "../hooks/useTaskActions";
import { useTaskModalStore } from "../store";

interface CreateTaskModalProps {
  /** Current note path (or null when no note is open) for create mode. */
  getActivePath: () => string | null;
  /** Navigate to a task after creation (path + 1-based line). */
  onTaskCreated: (path: string, line?: number) => void;
}

const PRIORITIES = [
  { value: "", label: "None" },
  { value: "highest", label: "Highest" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "lowest", label: "Lowest" },
] as const;

const STATUSES = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const RECURRENCE_PRESETS = [
  { value: "", label: "No recurrence" },
  { value: "every day", label: "Every day" },
  { value: "every week", label: "Every week" },
  { value: "every 2 weeks", label: "Every 2 weeks" },
  { value: "every month", label: "Every month" },
  { value: "every year", label: "Every year" },
] as const;

/** Normalize IPC input: empty string fields are omitted (Rust clears on ""). */
function nonEmpty(v: string | undefined): string | undefined {
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function CreateTaskModal({
  getActivePath,
  onTaskCreated,
}: CreateTaskModalProps) {
  const { isOpen, mode, editTarget, close } = useTaskModalStore();
  const { createTask, updateTask, getTaskLine } = useTaskActions();

  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("");
  const [due, setDue] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [start, setStart] = useState("");
  const [recurrencePreset, setRecurrencePreset] = useState("");
  const [recurrenceCustom, setRecurrenceCustom] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);

  // Focus the description field whenever the dialog opens.
  useEffect(() => {
    if (isOpen) descriptionRef.current?.focus();
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen || mode !== "edit" || !editTarget) return;
    setError(null);
    getTaskLine(editTarget.path, editTarget.line)
      .then((line) => {
        setDescription(line.description);
        setStatus(line.status_char === " " ? "todo" : statusFromChar(line.status_char));
        setPriority(line.signifiers.priority ?? "");
        setDue(line.signifiers.due ?? "");
        setScheduled(line.signifiers.scheduled ?? "");
        setStart(line.signifiers.start ?? "");
        const rec = line.signifiers.recurrence ?? "";
        const preset = RECURRENCE_PRESETS.some((p) => p.value === rec)
          ? rec
          : "";
        setRecurrencePreset(preset);
        setRecurrenceCustom(preset ? "" : rec);
        setTags(
          line.signifiers.tags.map((t) => (t.startsWith("#") ? t.slice(1) : t)),
        );
      })
      .catch((e) => setError(String(e)));
  }, [isOpen, mode, editTarget, getTaskLine]);

  // Reset the form whenever the dialog opens in create mode.
  useEffect(() => {
    if (isOpen && mode === "create") {
      setDescription("");
      setStatus("todo");
      setPriority("");
      setDue("");
      setScheduled("");
      setStart("");
      setRecurrencePreset("");
      setRecurrenceCustom("");
      setTags([]);
      setTagInput("");
      setError(null);
      setIsSaving(false);
    }
  }, [isOpen, mode]);

  const recurrence = recurrencePreset || recurrenceCustom.trim();

  const validate = useCallback((): string | null => {
    if (description.trim() === "") return "Description is required.";
    if (recurrence !== "" && !due && !scheduled && !start) {
      return "Recurring tasks need at least one date (due, scheduled, or start).";
    }
    return null;
  }, [description, recurrence, due, scheduled, start]);

  const handleAddTag = useCallback(() => {
    const t = tagInput.trim().replace(/^#/, "");
    if (t === "") return;
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }, [tagInput, tags]);

  const handleTagKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddTag();
      } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
        setTags((prev) => prev.slice(0, -1));
      }
    },
    [handleAddTag, tagInput, tags.length],
  );

  const handleSubmit = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    const path = getActivePath();
    if (!path) {
      setError("No note is open to add the task to.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const input: {
        description: string;
        status?: string;
        priority?: string;
        due?: string;
        scheduled?: string;
        start?: string;
        recurrence?: string;
        tags?: string[];
      } = { description: description.trim() };
      if (mode === "edit") input.status = status;
      const priorityV = nonEmpty(priority);
      const dueV = nonEmpty(due);
      const scheduledV = nonEmpty(scheduled);
      const startV = nonEmpty(start);
      const recurrenceV = nonEmpty(recurrence);
      if (priorityV) input.priority = priorityV;
      if (dueV) input.due = dueV;
      if (scheduledV) input.scheduled = scheduledV;
      if (startV) input.start = startV;
      if (recurrenceV) input.recurrence = recurrenceV;
      if (tags.length > 0) input.tags = tags;
      if (mode === "create") {
        const line = await createTask({ path, ...input });
        close();
        onTaskCreated(path, line);
      } else if (editTarget) {
        await updateTask({ path: editTarget.path, line_number: editTarget.line, ...input });
        close();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  }, [
    validate, getActivePath, description, status, priority, due, scheduled,
    start, recurrence, tags, mode, createTask, updateTask, editTarget, close,
    onTaskCreated,
  ]);

  const openTagChips = useMemo(
    () => (
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
              onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
              className="text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
            >
              <IconX size={11} />
            </button>
          </span>
        ))}
      </div>
    ),
    [tags],
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New Task" : "Edit Task"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a task to the current note."
              : "Update the task on the current line."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="task-description"
              className="text-xs font-medium text-[var(--sat-text-secondary)]"
            >
              Description
            </label>
            <Input
              id="task-description"
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description"
            />
          </div>
          {mode === "edit" && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="task-status"
                className="text-xs font-medium text-[var(--sat-text-secondary)]"
              >
                Status
              </label>
              <Select.Root
                value={status}
                onValueChange={(v) => {
                  if (v !== null) setStatus(v);
                }}
                items={STATUSES}
              >
                <Select.Trigger
                  id="task-status"
                  className="flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2.5 text-xs text-[var(--sat-text-primary)] hover:border-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)] focus:outline-none cursor-pointer"
                >
                  <Select.Value />
                  <Select.Icon>
                    <IconChevronDown size={12} className="flex-shrink-0 text-[var(--sat-text-muted)]" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner sideOffset={4} align="start">
                    <Select.Popup className="z-50 min-w-[160px] rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] p-1 shadow-2xl">
                      <Select.List>
                        {STATUSES.map((s) => (
                          <Select.Item
                            key={s.value}
                            value={s.value}
                            className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs text-[var(--sat-text-secondary)] data-[highlighted]:bg-[var(--sat-surface-3)] data-[highlighted]:text-[var(--sat-text-primary)] data-[selected]:text-[var(--sat-accent-primary)] select-none outline-none"
                          >
                            <Select.ItemText>{s.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.List>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="task-priority"
              className="text-xs font-medium text-[var(--sat-text-secondary)]"
            >
              Priority
            </label>
            <Select.Root
              value={priority}
              onValueChange={(v) => {
                if (v !== null) setPriority(v);
              }}
              items={PRIORITIES}
            >
              <Select.Trigger
                id="task-priority"
                className="flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2.5 text-xs text-[var(--sat-text-primary)] hover:border-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)] focus:outline-none cursor-pointer"
              >
                <Select.Value />
                <Select.Icon>
                  <IconChevronDown size={12} className="flex-shrink-0 text-[var(--sat-text-muted)]" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner sideOffset={4} align="start">
                  <Select.Popup className="z-50 min-w-[160px] rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] p-1 shadow-2xl">
                    <Select.List>
                      {PRIORITIES.map((p) => (
                        <Select.Item
                          key={p.value}
                          value={p.value}
                          className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs text-[var(--sat-text-secondary)] data-[highlighted]:bg-[var(--sat-surface-3)] data-[highlighted]:text-[var(--sat-text-primary)] data-[selected]:text-[var(--sat-accent-primary)] select-none outline-none"
                        >
                          <Select.ItemText>{p.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["Due", due, setDue],
                ["Scheduled", scheduled, setScheduled],
                ["Start", start, setStart],
              ] as const
            ).map(([label, value, setter]) => (
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
                  onChange={(e) => setter(e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="task-recurrence"
              className="text-xs font-medium text-[var(--sat-text-secondary)]"
            >
              Recurrence
            </label>
            <Select.Root
              value={recurrencePreset}
              onValueChange={(v) => {
                if (v !== null) setRecurrencePreset(v);
              }}
              items={RECURRENCE_PRESETS}
            >
              <Select.Trigger
                id="task-recurrence"
                className="flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2.5 text-xs text-[var(--sat-text-primary)] hover:border-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)] focus:outline-none cursor-pointer"
              >
                <Select.Value />
                <Select.Icon>
                  <IconChevronDown size={12} className="flex-shrink-0 text-[var(--sat-text-muted)]" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner sideOffset={4} align="start">
                  <Select.Popup className="z-50 min-w-[160px] rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] p-1 shadow-2xl">
                    <Select.List>
                      {RECURRENCE_PRESETS.map((r) => (
                        <Select.Item
                          key={r.value}
                          value={r.value}
                          className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs text-[var(--sat-text-secondary)] data-[highlighted]:bg-[var(--sat-surface-3)] data-[highlighted]:text-[var(--sat-text-primary)] data-[selected]:text-[var(--sat-accent-primary)] select-none outline-none"
                        >
                          <Select.ItemText>{r.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
            {recurrencePreset === "" && (
              <Input
                value={recurrenceCustom}
                onChange={(e) => setRecurrenceCustom(e.target.value)}
                placeholder="Custom rule, e.g. every 3 days"
                className="mt-1.5"
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="task-tag-input"
              className="text-xs font-medium text-[var(--sat-text-secondary)]"
            >
              Tags
            </label>
            <div className="flex flex-col gap-2">
              {openTagChips}
              <Input
                id="task-tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type a tag and press Enter"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-[var(--sat-state-error)]" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={isSaving}>
              {isSaving ? "Saving…" : mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Status name from a checkbox marker text like "[x]" or "[ ]". */
function statusFromChar(c: string): string {
  switch (c) {
    case "/":
      return "in_progress";
    case "?":
      return "on_hold";
    case "x":
    case "X":
      return "done";
    case "-":
      return "cancelled";
    default:
      return "todo";
  }
}