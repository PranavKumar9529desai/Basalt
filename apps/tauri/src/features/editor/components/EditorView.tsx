import { commandService } from "@workspace/commands";
import { attachScrollHeader } from "@workspace/editor";
import { type LeafProps } from "@workspace/views";
import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";
import { InlineTitle } from "./InlineTitle";
import { Reading } from "./Reading";
import "./reading.css";
import { ConflictBanner } from "./ConflictBanner";
import { ContextMenu } from "./ContextMenu";
import { Host } from "./Host";
import { ScrollContainer } from "./ScrollContainer";
import { StatusLine } from "./StatusLine";
import { useEditor } from "../hooks/useEditor";
import { useRenameSignalStore } from "../store/renameSignal";

/**
 * Registered "markdown" view (ADR-018 Phase 2). One EditorView per session;
 * documents are swapped via setState() with a per-tab EditorState cache, so
 * undo history, cursor, and scroll survive tab switches. Typing never
 * re-renders React — the doc lives in CM6. Saves capture the doc from CM
 * state (debounced; a tab switch flushes the previous tab first). Word/char
 * stats are debounced, never O(n) per keystroke.
 *
 * The inline note title (ADR-023) is mounted in its own React root inside a
 * slot injected as the first child of `.cm-scroller`, so it scrolls with the
 * document while title edits never re-render the editor — the typing hot
 * path stays React-free.
 *
 * This component is intentionally thin: the controller owns the EditorView
 * and per-tab caches, and `useEditor` owns the lifecycle effects.
 * What remains is pure composition of the presentational chrome.
 */
export function EditorView({ tab }: LeafProps) {
  const {
    controller,
    io,
    services,
    view,
    menuState,
    setMenuState,
    conflict,
    handleReady,
    handleKeepMine,
    handleDiscard,
    documentRevision,
  } = useEditor(tab);
  const readingScrollRatioRef = useRef(0);

  // Scroller-injected title root: created once when the EditorView exists,
  // re-rendered on tab changes. The module-level set tracks which tab ids
  // already ran their one-shot auto-edit so switching away and back does not
  // re-enter rename mode.
  const titleSlotRef = useRef<HTMLElement | null>(null);
  const titleRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const autoEditedTabIdsRef = useRef<Set<string>>(new Set());

  // F2 / "rename note" signals from chrome targeting THIS tab produce an
  // increasing epoch here; the InlineTitle baselines its mount-time epoch so
  // tab switches never re-enter edit mode, only fresh signals do.
  const renameEpoch = useRenameSignalStore((s) =>
    s.tabId === tab.id ? s.seq : 0,
  );

  useEffect(() => {
    if (!view || titleSlotRef.current) return;
    const slot = document.createElement("div");
    const cleanup = attachScrollHeader(view, slot);
    const root = createRoot(slot);
    titleSlotRef.current = slot;
    titleRootRef.current = root;
    return () => {
      root.unmount();
      cleanup();
      titleSlotRef.current = null;
      titleRootRef.current = null;
    };
  }, [view]);

  useEffect(() => {
    if (!titleRootRef.current) return;
    const autoEdit =
      tab.renameOnOpen && !autoEditedTabIdsRef.current.has(tab.id);
    if (tab.renameOnOpen) autoEditedTabIdsRef.current.add(tab.id);
    titleRootRef.current.render(
      <InlineTitle
        key={tab.id}
        tab={tab}
        services={services}
        autoEdit={autoEdit}
        renameEpoch={renameEpoch}
        onSubmit={controller.focusBody}
      />,
    );
  }, [tab, services, renameEpoch, controller]);

  useEffect(() => {
    if (!view) return;
    if (tab.viewMode === "reading") {
      const range = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
      readingScrollRatioRef.current =
        range > 0 ? view.scrollDOM.scrollTop / range : 0;
    } else {
      const range = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
      // Scroll restoration intentionally mutates the CodeMirror DOM after the
      // mode transition; the editor controller remains the state owner.
      // eslint-disable-next-line react/immutability
      if (range > 0)
        view.scrollDOM.scrollTop = readingScrollRatioRef.current * range;
    }
  }, [tab.viewMode, view]);

  return (
    <>
      {conflict && (
        <ConflictBanner onKeepMine={handleKeepMine} onDiscard={handleDiscard} />
      )}
      <ScrollContainer>
        <Host
          initialState={controller.initialState}
          onReady={handleReady}
          className={
            tab.viewMode === "reading"
              ? "absolute inset-0 invisible pointer-events-none overflow-hidden"
              : "min-h-0 flex-1"
          }
        />
        {tab.viewMode === "reading" && (
          <Reading
            key={`${tab.id}:${documentRevision}`}
            markdown={controller.getCachedDocText(tab.id)}
            sourcePath={tab.path}
            title={tab.title}
            initialScrollRatio={readingScrollRatioRef.current}
            onScrollRatioChange={(ratio) => {
              readingScrollRatioRef.current = ratio;
            }}
            services={services}
            resolveAsset={services.resolveAsset}
          />
        )}
      </ScrollContainer>
      {io.status && <StatusLine status={io.status} />}
      <ContextMenu
        menuState={menuState}
        onMenuStateChange={setMenuState}
        view={view}
        onSearch={() => commandService.execute("search:open")}
      />
    </>
  );
}
