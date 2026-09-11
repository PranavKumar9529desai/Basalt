//! Create/edit task modal (ADR-048). Tasks ARE text: submit composes the
//! canonical checkbox line (`buildTaskLine`) and dispatches it into the
//! active editor at the caret (create) or in place of the target line
//! (edit). The editor doc — not an IPC write — is the single file writer,
//! so autosave persists the change and undo behaves naturally. The only IPC
//! here is the read-only `get_task_line` hydration for edit mode.
//! `fields.tsx` holds the shadcn inputs and `options.ts` the menus.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { EditorView } from "@codemirror/view";
import {
  buildTaskLine,
  findActiveMarkdownView,
} from "@workspace/editor";
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
}

/** Normalize form values: empty strings are omitted (no signifier emitted). */
function nonEmpty(v: string | undefined): string | undefined {
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Insert a fresh task line at the caret. Inserts directly when the cursor
 * sits at the document start or on an empty line; otherwise opens a new
 * line (Obsidian Tasks behavior — the create modal writes text, never
 * bytes to disk).
 */
function insertTaskLineAtCursor(view: EditorView, lineText: string): void {
  const pos = view.state.selection.main.head;
  const at = view.state.doc.lineAt(pos);
  const prefix = pos === 0 || at.length === 0 ? "" : "\n";
  const text = prefix + lineText;
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
}

export function CreateTaskModal({ getActivePath }: CreateTaskModalProps) {
  const { isOpen, mode, editTarget, close } = useTaskModalStore();
  const { getTaskLine } = useTaskActions();

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

  /** Compose the canonical line from the current form values. */
  const composeLine = useCallback(
    (opts: { indent?: string; withStatus?: boolean }): string =>
      buildTaskLine({
        indent: opts.indent,
        // Status is an edit-only field; create always starts as "todo".
        status: opts.withStatus ? status : "todo",
        description: description.trim(),
        priority: nonEmpty(priority),
        due: nonEmpty(due),
        scheduled: nonEmpty(scheduled),
        start: nonEmpty(start),
        recurrence: nonEmpty(recurrence),
        tags: tags.length > 0 ? tags : undefined,
      }),
    [status, description, priority, due, scheduled, start, recurrence, tags],
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
      const view = findActiveMarkdownView();
      if (!view) {
        setError(
          mode === "edit"
            ? "No editor is open to update the task."
            : "No editor is open to add the task to.",
        );
        return;
      }
      if (mode === "create") {
        insertTaskLineAtCursor(view, composeLine({}));
      } else if (editTarget) {
        // Replace the targeted line in the OPEN DOC (clamped to its length) —
        // preserving the line's indentation from the editor, not from disk.
        const doc = view.state.doc;
        const n = Math.min(Math.max(1, editTarget.line), doc.lines);
        const line = doc.line(n);
        const indent = line.text.match(/^[ \t]*/)?.[0] ?? "";
        const lineText = composeLine({ indent, withStatus: true });
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: lineText },
          selection: { anchor: line.from + lineText.length },
        });
      }
      close();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  }, [
    validate,
    getActivePath,
    mode,
    editTarget,
    composeLine,
    close,
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