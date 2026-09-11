import {
  BlockContext,
  LeafBlock,
  type LeafBlockParser,
  type MarkdownConfig,
} from "@lezer/markdown";

const TASK_MARKER_STATUS_RE = /^\[[ xX/?-]\][ \t]/;

class ExtendedTaskLeafParser implements LeafBlockParser {
  nextLine(): boolean {
    return false;
  }

  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    cx.addLeafElement(
      leaf,
      cx.elt("Task", leaf.start, leaf.start + leaf.content.length, [
        cx.elt("TaskMarker", leaf.start, leaf.start + 3),
        ...cx.parser.parseInline(leaf.content.slice(3), leaf.start + 3),
      ]),
    );
    return true;
  }
}

/**
 * ADR-033 grammar manifest: task-list statuses.
 *
 * The base @lezer/markdown GFM `TaskList` block parser only emits a
 * `TaskMarker` node when the checkbox reads `[ ]`, `[x]`, or `[X]`
 * (`/^\[[ xX]\][ \t]/`). Basalt's task status machine
 * (`statusToCheckboxChar`) also writes `/` (in_progress), `?` (on_hold)
 * and `-` (cancelled). Once a line cycles to one of those, the node
 * disappears — silently breaking every consumer keyed off `TaskMarker`:
 * the checkbox decoration (`input/task-list.ts`), the toggle/cycle
 * commands (`features/tasks/lib/commands.ts`), and the signifier pipeline.
 *
 * This is a parser gap (not a collision), so per the registry encoding rule
 * we mirror the base `TaskParser`/`TaskList` and re-emit the SAME built-in
 * `Task` + `TaskMarker` nodes — just for the wider marker set. Declared
 * `before: "TaskList"` so one parser handles all six statuses uniformly
 * (identical tree shape for `[ ]`/`[x]`; extra statuses for `/`, `?`, `-`).
 */
export const taskStatusExtension: MarkdownConfig = {
  parseBlock: [
    {
      name: "BasaltTaskList",
      after: "SetextHeading",
      before: "TaskList",
      leaf(cx, leaf) {
        return TASK_MARKER_STATUS_RE.test(leaf.content) &&
          cx.parentType().name === "ListItem"
          ? new ExtendedTaskLeafParser()
          : null;
      },
    },
  ],
};