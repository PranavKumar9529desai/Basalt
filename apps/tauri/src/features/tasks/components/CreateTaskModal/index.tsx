//! Create/edit task modal (create mode: `create_task` appends a checkbox
//! line then navigates; edit mode: hydrated from `get_task_line`, rewritten
//! via `update_task`). Form state, validation, and submission live here;
//! `fields.tsx` holds the presentational inputs and `options.ts` the menus.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";

import { useTaskActions } from "../../hooks/useTaskActions";
import { useTaskModalStore } from "../../store";
import {
  DateField,
  DescriptionField,
  LabeledSelect,
  RecurrenceField,
  TagField,
} from "./fields";
import {
  PRIORITIES,
  RECURRENCE_PRESETS,
  STATUSES,
  statusFromChar,
} from "./options";

interface CreateTaskModalProps {
  /** Current note path (or null when no note is open) for create mode. */
  getActivePath: () => string | null;
  /** Navigate to a task after creation (path + 1-based line). */
  onTaskCreated: (path: string, line?: number) => void;
}

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

  // Hydrate the form from the task line when opening in edit mode.
  useEffect(() => {
    if (!isOpen || mode !== "edit" || !editTarget) return;
    setError(null);
    getTaskLine(editTarget.path, editTarget.line)
      .then((line) => {
        setDescription(line.description);
        setStatus(
          line.status_char === " " ? "todo" : statusFromChar(line.status_char),
        );
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
          line.signifiers.tags.map((t) =>
            t.startsWith("#") ? t.slice(1) : t,
          ),
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
        await updateTask({
          path: editTarget.path,
          line_number: editTarget.line,
          ...input,
        });
        close();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  }, [
    validate,
    getActivePath,
    description,
    status,
    priority,
    due,
    scheduled,
    start,
    recurrence,
    tags,
    mode,
    createTask,
    updateTask,
    editTarget,
    close,
    onTaskCreated,
  ]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New Task" : "Edit Task"}
          </DialogTitle>
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
          <DescriptionField
            ref={descriptionRef}
            value={description}
            onChange={setDescription}
          />
          {mode === "edit" && (
            <LabeledSelect
              id="task-status"
              label="Status"
              value={status}
              onValueChange={setStatus}
              options={STATUSES}
            />
          )}
          <LabeledSelect
            id="task-priority"
            label="Priority"
            value={priority}
            onValueChange={setPriority}
            options={PRIORITIES}
          />
          <div className="grid grid-cols-3 gap-2">
            <DateField label="Due" value={due} onChange={setDue} />
            <DateField
              label="Scheduled"
              value={scheduled}
              onChange={setScheduled}
            />
            <DateField label="Start" value={start} onChange={setStart} />
          </div>
          <RecurrenceField
            preset={recurrencePreset}
            onPresetChange={setRecurrencePreset}
            custom={recurrenceCustom}
            onCustomChange={setRecurrenceCustom}
            presets={RECURRENCE_PRESETS}
          />
          <TagField
            tags={tags}
            onRemove={(tag) =>
              setTags((prev) => prev.filter((t) => t !== tag))
            }
            input={tagInput}
            onInputChange={setTagInput}
            onInputKeyDown={handleTagKeyDown}
          />

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
              {isSaving
                ? "Saving…"
                : mode === "create"
                  ? "Create"
                  : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}