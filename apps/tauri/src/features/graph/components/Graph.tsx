// The real vault note-link graph, rendered as a full workbench leaf. Feeds
// `get_graph` to the wasm force graph (lib/graphWorker), then draws on a WebGL2
// canvas (packages/graph) with Obsidian-style interactions + controls:
// hover-highlight, click-to-open, right-click context menu, wheel zoom,
// drag-pan, node drag, filter bar (tag:/path:/ operators), color groups (by
// tag, then folder), local-graph mode from the active note (or a chosen root)
// with a depth control, directional arrows, and display toggles (orphans /
// attachments / text-fade). Text labels use a transparent 2D overlay so the
// GL canvas stays pure geometry (ADR-021: WebGL2, never Canvas2D).
//
// Since ADR-038 §3 the logic lives in features/graph/lib/: this component is
// JSX + store wiring only — the engine (useGraphEngine) owns the renderer,
// worker, data store, subset rebuild, draw loop and event surface; persistence
// (camera/zoom/controls snapshots) is usePersistedGraphState.
import { useEffect, useRef, useState } from "react";
import { useLeafServices, type LeafProps } from "@workspace/views";
import { Button } from "@workspace/ui/components/ui/button";
import { GraphControls, type GraphColorMode } from "./GraphControls";
import { GraphContextMenu } from "./GraphContextMenu";
import {
  useGraphEngine,
  type GraphEngineControls,
} from "../lib/useGraphEngine";
import { usePersistedGraphState } from "../lib/persistedState";
import { basename } from "../lib/filters";

export function Graph({ tab }: LeafProps) {
  const services = useLeafServices();
  const activeNotePath = services.activeNote?.path ?? null;

  // The leaf-services bag identity changes whenever activeNote/activeTab
  // change, but these callbacks themselves are stable. Mount the worker +
  // renderer ONCE: remounting would reset camera + layout and rerun the whole
  // force sim every time the user switches notes.
  const openNoteRef = useRef(services.openNote);
  openNoteRef.current = services.openNote;

  const [query, setQuery] = useState("");
  const [local, setLocal] = useState(false);
  const [showOrphans, setShowOrphans] = useState(true);
  const [showAttach, setShowAttach] = useState(true);
  const [localDepth, setLocalDepth] = useState(2);
  const [localRoot, setLocalRoot] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<GraphColorMode>("single");
  const [controlsOpen, setControlsOpen] = useState(true);

  // Live mirrors of control state so the mount-only engine reads current values.
  const controlsRef = useRef<GraphEngineControls>({
    query: "",
    local: false,
    showOrphans: true,
    showAttach: true,
    activeNotePath: null,
    localDepth: 2,
    localRoot: null,
    colorMode: "single",
  });
  controlsRef.current = {
    query,
    local,
    showOrphans,
    showAttach,
    activeNotePath: activeNotePath ?? null,
    localDepth,
    localRoot,
    colorMode,
  };

  const {
    glRef,
    labelRef,
    wrapRef,
    pathsRef,
    viewRef,
    hover,
    preview,
    menu,
    loaded,
    error,
    recolor,
    rebuild,
    centerOn,
    refit,
    retry,
    closeMenu,
  } = useGraphEngine({ openNoteRef, setQuery, controls: controlsRef });

  usePersistedGraphState(
    tab.path,
    {
      query,
      local,
      localDepth,
      localRoot,
      showOrphans,
      showAttach,
      colorMode,
      controlsOpen,
    },
    viewRef,
    (saved) => {
      setQuery(saved.query ?? "");
      setLocal(Boolean(saved.local));
      setLocalDepth(Math.max(1, Math.min(5, saved.localDepth ?? 2)));
      setLocalRoot(saved.localRoot ?? null);
      setShowOrphans(saved.showOrphans ?? true);
      setShowAttach(saved.showAttach ?? true);
      setColorMode(saved.colorMode ?? "single");
      setControlsOpen(saved.controlsOpen ?? true);
      if (saved.camera) viewRef.current = { ...saved.camera, fitted: true };
    },
  );

  // Recolor only — repaints node colors without re-seeding the force sim.
  useEffect(() => {
    recolor();
  }, [colorMode, recolor]);

  // Rebuild the visible subset whenever a control changes (debounced).
  // activeNotePath feeds the local-graph root, so it must rebuild in local
  // mode; in global mode it only affects the highlighted/hovered node, never
  // the visible subset — so we gate it to null there to avoid re-seeding the
  // force sim and resetting the camera whenever the user clicks between notes.
  const rebuildOnActiveNote = local ? activeNotePath : null;
  useEffect(() => {
    const t = setTimeout(() => rebuild(), 120);
    return () => clearTimeout(t);
  }, [
    query,
    showOrphans,
    showAttach,
    local,
    localDepth,
    localRoot,
    rebuildOnActiveNote,
    loaded,
    rebuild,
  ]);

  const centerActive = () => {
    if (!activeNotePath) return;
    const full = pathsRef.current.indexOf(activeNotePath);
    if (full >= 0) centerOn(full);
  };

  const openInNewTab = (full: number) => {
    const path = pathsRef.current[full];
    if (!path) return;
    services.openPinned({ path, title: basename(path) });
  };
  const handleMenuOpen = (full: number) => {
    const path = pathsRef.current[full];
    if (path) services.openNote(path);
    closeMenu();
  };
  const handleMenuOpenInNewTab = (full: number) => {
    openInNewTab(full);
    closeMenu();
  };
  const handleMenuCenter = (full: number) => {
    centerOn(full);
    closeMenu();
  };
  const handleMenuLocalGraph = (full: number) => {
    const path = pathsRef.current[full];
    if (path) setLocalRoot(path);
    setLocal(true);
    closeMenu();
  };
  const handleMenuExpand = (full: number) => {
    const path = pathsRef.current[full];
    if (path) setLocalRoot(path);
    setLocal(true);
    setLocalDepth((d) => Math.min(d + 1, 4));
    closeMenu();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
        backgroundColor: "var(--sat-graph-background)",
      }}
    >
      {controlsOpen && (
        <GraphControls
          colorMode={colorMode}
          onColorModeChange={setColorMode}
          query={query}
          onQueryChange={setQuery}
          local={local}
          onToggleLocal={() => setLocal((l) => !l)}
          localDepth={localDepth}
          onLocalDepthChange={setLocalDepth}
          onCenter={centerActive}
          onFit={refit}
          showOrphans={showOrphans}
          onToggleOrphans={() => setShowOrphans((o) => !o)}
          showAttach={showAttach}
          onToggleAttach={() => setShowAttach((a) => !a)}
          onClose={() => setControlsOpen(false)}
        />
      )}
      <div
        ref={wrapRef}
        style={{
          position: "relative",
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "hidden",
          backgroundColor: "var(--sat-graph-background)",
        }}
      >
        {!controlsOpen && (
          <Button
            variant="outline"
            size="sm"
            style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}
            onClick={() => setControlsOpen(true)}
          >
            Graph settings
          </Button>
        )}
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              textAlign: "center",
              color: "var(--sat-text-primary)",
              fontSize: 13,
              lineHeight: 1.5,
              zIndex: 6,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Graph failed to load
              </div>
              <div style={{ opacity: 0.75 }}>{error}</div>
              <Button
                variant="outline"
                size="sm"
                style={{ marginTop: 12 }}
                onClick={retry}
              >
                Retry
              </Button>
            </div>
          </div>
        )}
        <canvas
          ref={glRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            background: "var(--sat-graph-background)",
            display: "block",
            cursor: "grab",
          }}
        />
        <canvas
          ref={labelRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
        {hover && (
          <div
            style={{
              position: "absolute",
              left: hover.x + 10,
              top: hover.y + 10,
              maxWidth: 280,
              padding: "6px 8px",
              background: "var(--sat-surface-1)",
              color: "var(--sat-text-primary)",
              fontSize: 12,
              borderRadius: 6,
              pointerEvents: "none",
              whiteSpace: "pre-wrap",
              boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
              zIndex: 5,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: hover.isTag || !preview ? 0 : 4,
              }}
            >
              {hover.title}
            </div>
            {!hover.isTag && preview && preview.excerpt && (
              <div
                style={{
                  opacity: 0.85,
                  lineHeight: 1.45,
                  maxHeight: 120,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 6,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {preview.excerpt}
              </div>
            )}
          </div>
        )}
        <GraphContextMenu
          menu={menu}
          isTag={menu?.isTag ?? false}
          onOpen={handleMenuOpen}
          onOpenInNewTab={handleMenuOpenInNewTab}
          onCenter={handleMenuCenter}
          onOpenLocalGraph={handleMenuLocalGraph}
          onExpand={handleMenuExpand}
          onFilter={(full) => {
            setQuery(`tag:${pathsRef.current[full]}`);
            closeMenu();
          }}
        />
      </div>
    </div>
  );
}