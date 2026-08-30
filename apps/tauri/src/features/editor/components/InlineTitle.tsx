import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { LeafServices, LeafTabInfo } from "@workspace/views";

/**
 * Inline note title rendered inside the scroller slot (ADR-023): the note's
 * live title in display mode; clicking it swaps to an edit input with the
 * whole name selected. Enter commits the rename (backend rewrites wikilinks,
 * the shared orchestrator repoints the tab), Esc cancels, and blur commits
 * if the name changed (Obsidian semantics).
 *
 * Mounted in its own React root (first child of `.cm-scroller`) so title
 * state never re-renders the CodeMirror editor — the typing hot path stays
 * React-free.
 */
export function InlineTitle({
  tab,
  services,
  autoEdit,
  renameEpoch,
}: {
  tab: LeafTabInfo;
  services: LeafServices;
  /** Enter edit mode with the name selected on mount (note creation). */
  autoEdit?: boolean;
  /**
   * Monotonic per-tab rename intent from chrome (F2, ⋮ menu). Any epoch
   * higher than the one observed at mount means "start a rename now" — the
   * mount-time baseline means switching tabs never re-enters edit mode.
   */
  renameEpoch?: number;
}) {
  const [mode, setMode] = useState<"display" | "edit">("display");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const pendingRef = useRef(false);
  // Sync mirrors for the unmount cleanup — state reads there are stale.
  const modeRef = useRef<"display" | "edit">("display");
  const valueRef = useRef("");
  // The stem the current edit session started from — blur only commits when
  // the value actually changed.
  const sourceStemRef = useRef(tab.title.replace(/\.md$/i, ""));
  const servicesRef = useRef(services);
  servicesRef.current = services;

  // Live title: the tabs store repoints path/title on rename before the leaf
  // re-renders, so read through getTabInfo first.
  const liveTitle = services.getTabInfo(tab.id)?.title ?? tab.title;
  const liveStem = liveTitle.replace(/\.md$/i, "");

  const startEdit = (stem: string) => {
    sourceStemRef.current = stem;
    setValue(stem);
    setError(null);
    cancelledRef.current = false;
    setMode("edit");
  };

  useEffect(() => {
    modeRef.current = mode;
    valueRef.current = value;
  }, [mode, value]);

  // Commit an in-progress rename when the title unmounts (tab switch) so an
  // interrupted edit is never silently lost. Async-fails on unmount have no
  // UI left to surface — the tab simply keeps its old title.
  useEffect(() => {
    const id = tab.id;
    const path = tab.path;
    return () => {
      if (modeRef.current !== "edit") return;
      if (pendingRef.current || cancelledRef.current) return;
      const next = valueRef.current.trim();
      if (!next || next === sourceStemRef.current) return;
      void servicesRef.current.renameNote({ id, path }, next);
    };
  }, [tab.id, tab.path, servicesRef]);

  // On mount: honor the creation-time rename intent (select-all title edit).
  useEffect(() => {
    if (autoEdit) startEdit(liveStem);
    // Deliberately mount-only — mirroring renameOnOpen's once-per-tab
    // semantics (the leaf tracks which tab ids already auto-edited).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External rename intent (F2 / ⋮ menu). The mount-time epoch is the
  // baseline: an epoch equal to the one observed on mount is the pre-existing
  // value from a previous signal and MUST NOT re-enter edit mode after a tab
  // switch. Only a strictly newer signal does.
  const mountedEpochRef = useRef(renameEpoch ?? 0);
  useEffect(() => {
    const epoch = renameEpoch ?? 0;
    if (epoch > mountedEpochRef.current) {
      mountedEpochRef.current = epoch;
      startEdit(liveStem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renameEpoch, liveStem]);

  // Select-all whenever the input mounts/enters edit mode.
  useEffect(() => {
    if (mode === "edit" && inputRef.current) inputRef.current.select();
  }, [mode]);

  const exitEdit = () => {
    setMode("display");
    setError(null);
  };

  const commit = async () => {
    // Synchronous guard: Enter-then-blur in the same tick would otherwise
    // double-commit while the async rename is in flight.
    if (pendingRef.current) return;
    const next = value.trim();
    if (!next) {
      setError("name cannot be empty");
      inputRef.current?.select();
      return;
    }
    if (next === sourceStemRef.current) {
      exitEdit();
      return;
    }
    pendingRef.current = true;
    setPending(true);
    const result = await servicesRef.current.renameNote(
      { id: tab.id, path: tab.path },
      next,
    );
    pendingRef.current = false;
    setPending(false);
    if (result.ok) {
      sourceStemRef.current = next;
      exitEdit();
    } else {
      setError(result.error);
      inputRef.current?.select();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      cancelledRef.current = true;
      exitEdit();
    }
  };

  const handleBlur = () => {
    // Ignore cancellation (Esc) and in-flight commits.
    if (cancelledRef.current || pendingRef.current) return;
    if (mode !== "edit") return;
    const next = value.trim();
    if (!next || next === sourceStemRef.current) {
      exitEdit();
      return;
    }
    void commit();
  };

  if (mode === "display") {
    return (
      <button
        type="button"
        className="block w-full cursor-text select-text border-none bg-transparent p-0 text-left text-[2em] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--sat-editor-heading1,var(--sat-text-primary))]"
        onClick={() => startEdit(liveStem)}
        onMouseDown={(e) => e.stopPropagation()}
        title="Click to rename"
      >
        {liveStem}
      </button>
    );
  }

  return (
    <div className="block w-full">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={pending}
        spellCheck={false}
        aria-label="Note title"
        className="block w-full border-b border-[var(--sat-accent-primary)] bg-transparent pb-1 text-[2em] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--sat-editor-heading1,var(--sat-text-primary))] outline-none"
      />
      {error && (
        <div className="pt-1 text-xs text-[var(--sat-state-danger,var(--sat-accent-primary))]">
          {error}
        </div>
      )}
    </div>
  );
}