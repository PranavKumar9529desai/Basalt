import { EditorView } from "@codemirror/view";

/**
 * Shared task-checkbox styling — the box and its per-status glyphs are drawn
 * in pure CSS (no image assets), driven by a `data-status` attribute so a
 * task reads the same in every surface:
 *
 * - inline editor widget (`input/task-list.ts`): a `.cm-task-checkbox` box
 *   wrapping an invisible `<input class="cm-task-checkbox-input">` that
 *   carries the click + a11y semantics;
 * - DQL ```tasks query rows (`block-widgets/task-query-html.ts`): a bare
 *   `.cm-task-checkbox` box span.
 *
 * Statuses painted: todo (empty box), in_progress (half-filled),
 * on_hold ("?" glyph), done (success fill + checkmark), cancelled (muted
 * dash). Colors are `--sat-*` tokens only (ADR-002).
 */
export const TASK_CHECKBOX_STYLE: Parameters<typeof EditorView.baseTheme>[0] = {
  // --- Box ---------------------------------------------------------------
  ".cm-task-checkbox": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    flexShrink: "0",
    width: "16px",
    height: "16px",
    border: "1.5px solid var(--sat-layout-border, #334155)",
    borderRadius: "5px",
    backgroundColor: "transparent",
    position: "relative",
    transition:
      "border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease",
  },
  ".cm-task-checkbox:hover": {
    borderColor:
      "var(--sat-editor-task-accent, var(--sat-accent-primary, #ff6a00))",
  },
  ".cm-task-checkbox:focus-within": {
    outline: "none",
    borderColor:
      "var(--sat-control-focus-ring, var(--sat-accent-primary, #ff6a00))",
    boxShadow:
      "0 0 0 3px color-mix(in srgb, var(--sat-control-focus-ring, var(--sat-accent-primary, #ff6a00)) 22%, transparent)",
  },
  // Invisible, input-covering hit + a11y surface (editor widget only).
  ".cm-task-checkbox-input": {
    appearance: "none",
    WebkitAppearance: "none",
    position: "absolute",
    inset: "0",
    margin: "0",
    padding: "0",
    border: "none",
    cursor: "pointer",
  },

  // --- in_progress: half-filled with the warning color ------------------
  '.cm-task-checkbox[data-status="in_progress"]': {
    borderColor: "var(--sat-state-warning, #f59e0b)",
    backgroundImage:
      "linear-gradient(90deg, var(--sat-state-warning, #f59e0b) 50%, transparent 50%)",
  },

  // --- on_hold: question-mark glyph -------------------------------------
  '.cm-task-checkbox[data-status="on_hold"]::after': {
    content: '"?"',
    position: "absolute",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: "700",
    color: "var(--sat-state-warning, #f59e0b)",
    pointerEvents: "none",
  },

  // --- done: success fill + white checkmark -----------------------------
  '.cm-task-checkbox[data-status="done"]': {
    backgroundColor: "var(--sat-state-success, #22c55e)",
    borderColor: "var(--sat-state-success, #22c55e)",
  },
  '.cm-task-checkbox[data-status="done"]::after': {
    content: '""',
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "5px",
    height: "8px",
    border: "solid var(--sat-text-inverse, #ffffff)",
    borderWidth: "0 2px 2px 0",
    transform: "translate(-50%, -58%) rotate(45deg)",
    pointerEvents: "none",
  },

  // --- cancelled: muted border + horizontal dash ------------------------
  '.cm-task-checkbox[data-status="cancelled"]': {
    borderColor: "var(--sat-text-muted, #64748b)",
    opacity: "0.8",
  },
  '.cm-task-checkbox[data-status="cancelled"]::after': {
    content: '""',
    position: "absolute",
    left: "3px",
    right: "3px",
    top: "50%",
    height: "2px",
    transform: "translateY(-50%)",
    borderRadius: "1px",
    backgroundColor: "var(--sat-text-muted, #64748b)",
    pointerEvents: "none",
  },
};
