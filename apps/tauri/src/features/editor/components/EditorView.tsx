import { commandService } from "@workspace/commands";
import { attachScrollHeader } from "@workspace/editor";
import { type LeafProps } from "@workspace/views";
import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";
import { InlineTitle } from "./InlineTitle";
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
 * A single CM6 view serves both edit and reading modes. Mode switching is
 * handled by reconfiguring a Compartment in the controller — scroll position
 * and undo history survive the transition natively.
 */
export function EditorView({ tab, paneId }: LeafProps) {
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
  } = useEditor(tab, paneId);

  const titleSlotRef = useRef<HTMLElement | null>(null);
  const titleRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const autoEditedTabIdsRef = useRef<Set<string>>(new Set());

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
    controller.setMode(tab.viewMode ?? "edit");
  }, [tab.viewMode, view, controller]);

  return (
    <>
      {conflict && (
        <ConflictBanner onKeepMine={handleKeepMine} onDiscard={handleDiscard} />
      )}
      <ScrollContainer>
        <Host
          initialState={controller.initialState}
          onReady={handleReady}
          className="min-h-0 flex-1"
        />
      </ScrollContainer>
      {io.status && <StatusLine status={io.status} />}
      <ContextMenu
        menuState={menuState}
        onMenuStateChange={setMenuState}
        onSearch={() => commandService.execute("search:open")}
      />
    </>
  );
}
