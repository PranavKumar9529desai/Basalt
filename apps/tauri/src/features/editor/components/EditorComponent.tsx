import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { useLatestRef } from "../hooks/useLatestRef";

export interface EditorComponentProps {
  /**
   * The state the view is created with. The view is created ONCE on mount;
   * later document swaps are done by the owner calling `view.setState()`
   * with a state built from the SAME extensions — never by re-mounting.
   */
  initialState: EditorState;
  /** Called once the EditorView exists. */
  onReady?: (view: EditorView) => void;
  className?: string;
}

/**
 * Raw CodeMirror host — uncontrolled by design.
 *
 * The document lives inside CodeMirror; React never receives it on
 * keystrokes. This is the core of the editor performance model: typing
 * causes zero React re-renders.
 */
export function EditorComponent({
  initialState,
  onReady,
  className = "",
}: EditorComponentProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useLatestRef(onReady);

  useEffect(() => {
    if (!parentRef.current) return;
    const view = new EditorView({
      state: initialState,
      parent: parentRef.current,
    });
    onReadyRef.current?.(view);
    return () => view.destroy();
    // Mount once — document swaps happen via view.setState() by the owner.
    // (deps intentionally empty)
  }, []);

  return (
    <div
      className={`flex h-full min-h-0 w-full flex-col bg-[var(--sat-editor-background,#0f172a)] ${className}`}
    >
      <div ref={parentRef} className="relative flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
