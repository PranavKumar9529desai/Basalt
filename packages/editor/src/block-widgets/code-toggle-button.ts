import { EditorView } from "@codemirror/view";

export interface CodeToggleButtonOptions {
  className?: string;
  title?: string;
}

/**
 * Creates a standardized Code Toggle Button DOM element with high z-index and
 * backdrop blur overlay, used across Tables, Asset Embeds, and DQL widgets.
 */
export function createCodeToggleButton(
  view: EditorView,
  onToggle: (view: EditorView) => void,
  options?: CodeToggleButtonOptions,
): HTMLButtonElement {
  const btn = document.createElement("button");
  const extraClass = options?.className ? ` ${options.className}` : "";
  btn.className = `cm-code-btn-toggle${extraClass}`;
  btn.type = "button";
  const title = options?.title ?? "Edit as raw Markdown";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;

  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle(view);
    view.focus();
  });

  return btn;
}

export const CODE_TOGGLE_BUTTON_THEME = EditorView.baseTheme({
  ".cm-code-btn-toggle": {
    position: "absolute",
    top: "6px",
    right: "6px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "26px",
    borderRadius: "var(--sat-layout-radius-sm, 4px)",
    background: "rgba(15, 23, 42, 0.85)",
    backdropFilter: "blur(4px)",
    border: "1px solid var(--sat-layout-border, rgba(255, 255, 255, 0.2))",
    color: "var(--sat-text-primary, #f8fafc)",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
    cursor: "pointer",
    opacity: "0.75",
    transition:
      "opacity 0.15s ease, background 0.15s ease, color 0.15s ease, transform 0.1s ease",
    zIndex: "50",
  },
  ".cm-code-btn-toggle:hover": {
    opacity: "1",
    background: "rgba(30, 41, 59, 0.95)",
    color: "var(--sat-accent-primary, #60a5fa)",
    transform: "scale(1.05)",
  },
});
