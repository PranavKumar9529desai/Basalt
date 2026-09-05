// useCanvasController — owns all canvas refs, GPU push, spatial index,
// mutations, and event handlers. CanvasView.tsx is thin composition only.

import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CanvasViewportRenderer } from "@workspace/canvas-viewport";
import type { CanvasTransform } from "@workspace/canvas-viewport";
import { keybindingService } from "@workspace/keybindings";
import { SpatialIndex } from "./lib/spatial";
import {
  type Scene, type SceneGroup,
  buildBuffers, buildArrowBuffers,
  nextId, unionBounds, sceneNodeAABB, sceneGroupAABB, MOCK_SCENE,
} from "./lib/scene";
import type { DragMode, EdgeDraft } from "./lib/interaction";
import {
  worldPos, nearestHandle, sideMidpoint, MARQUEE_THRESHOLD, MIN_SCALE, MAX_SCALE, SCALE_STEP,
} from "./lib/interaction";
import { syncOverlay, type OverlayRefs } from "./lib/overlay";

// ─── Public handle for commands / overlay sync ──────────────────────────────

export interface CanvasController {
  // Refs (read by effects in CanvasView).
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  rendererRef: React.RefObject<CanvasViewportRenderer | null>;
  viewRef: React.RefObject<CanvasTransform>;
  rafRef: React.RefObject<number>;
  gpuDirtyRef: React.RefObject<boolean>;
  sceneRef: React.RefObject<Scene>;
  selectedRef: React.RefObject<Set<string>>;
  savePathRef: React.RefObject<string | null>;
  edgeDraftRef: React.RefObject<EdgeDraft | null>;
  marqueeRef: React.RefObject<HTMLDivElement | null>;
  edgeLineRef: React.RefObject<SVGLineElement | null>;
  handleContainerRef: React.RefObject<HTMLDivElement | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  overlayNodesRef: React.RefObject<Map<string, HTMLElement>>;

  // Callbacks (used by CanvasView boot/resize/effects).
  rebuildIndex: () => void;
  pushGPU: () => void;
  pushAlphas: () => void;
  syncOverlay: () => void;
  scheduleSave: () => void;
  deleteSelection: () => void;
  createTextCard: (wx: number, wy: number) => void;
  groupSelection: () => void;

  // Event handlers (wired to JSX).
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onContainerFocus: () => void;
  onContainerBlur: () => void;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useCanvasController(): CanvasController {
  // ── Refs ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CanvasViewportRenderer | null>(null);
  const viewRef = useRef<CanvasTransform>({ scale: 1, ox: 200, oy: 100 });
  const rafRef = useRef<number>(0);
  const gpuDirtyRef = useRef(true);
  const sceneRef = useRef<Scene>(MOCK_SCENE);
  const indexRef = useRef(new SpatialIndex<"node" | "group">());
  const savePathRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const selectedRef = useRef(new Set<string>());
  const hoveredRef = useRef<string | null>(null);
  const dragModeRef = useRef<DragMode | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const edgeDraftRef = useRef<EdgeDraft | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayNodesRef = useRef(new Map<string, HTMLElement>());
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const edgeLineRef = useRef<SVGLineElement | null>(null);
  const handleContainerRef = useRef<HTMLDivElement | null>(null);


  // ── Rebuild spatial index ──
  const rebuildIndex = useCallback(() => {
    const idx = indexRef.current;
    const scene = sceneRef.current;
    idx.clear();
    for (const n of scene.nodes) idx.insert(n.id, sceneNodeAABB(n), "node");
    for (const g of scene.groups) idx.insert(g.id, sceneGroupAABB(g), "group");
  }, []);

  // ── Visible set (viewport culling) ──
  const computeVisible = useCallback((): Set<string> => {
    const v = viewRef.current;
    const cw = containerRef.current?.clientWidth ?? 800;
    const ch = containerRef.current?.clientHeight ?? 600;
    const margin = 0.5;
    const vw = cw / v.scale;
    const vh = ch / v.scale;
    return new Set(indexRef.current.query({
      x: -v.ox / v.scale - vw * margin,
      y: -v.oy / v.scale - vh * margin,
      w: vw * (1 + margin * 2),
      h: vh * (1 + margin * 2),
    }));
  }, []);

  // ── Push GPU (culled) ──
  const pushGPU = useCallback(() => {
    const r = rendererRef.current;
    const scene = sceneRef.current;
    if (!r) return;
    const visible = computeVisible();
    const buf = buildBuffers(scene, visible);
    r.setGroups(buf.grpPos, buf.grpSz, buf.grpRgb, buf.grpA);
    r.setNodes(buf.nodePos, buf.nodeSz, buf.nodeRgb, buf.nodeA);
    r.setEdges(buf.edgeMids, buf.edgeDirs, buf.edgeRgb, buf.edgeA);
    r.setArrows(buildArrowBuffers(scene, visible));
    gpuDirtyRef.current = true;
  }, [computeVisible]);

  // ── Push alphas only (hover/select dimming) ──
  const pushAlphas = useCallback(() => {
    const r = rendererRef.current;
    const scene = sceneRef.current;
    if (!r) return;
    const hasHover = hoveredRef.current !== null || selectedRef.current.size > 0;
    const nodeA = new Float32Array(scene.nodes.length);
    const grpA = new Float32Array(scene.groups.length);
    for (let i = 0; i < scene.nodes.length; i++) {
      const id = scene.nodes[i].id;
      nodeA[i] = hasHover && !selectedRef.current.has(id) && id !== hoveredRef.current ? 0.55 : 1;
    }
    for (let i = 0; i < scene.groups.length; i++) {
      grpA[i] = hasHover && !selectedRef.current.has(scene.groups[i].id) ? 0.12 : 0.25;
    }
    const buf = buildBuffers(scene);
    r.setNodes(buf.nodePos, buf.nodeSz, buf.nodeRgb, nodeA);
    r.setGroups(buf.grpPos, buf.grpSz, buf.grpRgb, grpA);
    gpuDirtyRef.current = true;
  }, []);

  // ── Sync overlay (closes over live refs) ──
  const syncOverlayCb = useCallback(() => {
    const or: OverlayRefs = {
      root: overlayRef.current,
      nodes: overlayNodesRef.current,
      container: containerRef.current,
      handleContainer: handleContainerRef.current,
      edgeLine: edgeLineRef.current,
    };
    syncOverlay(
      or, sceneRef.current, selectedRef.current, hoveredRef.current,
      edgeDraftRef.current, containerRef.current, viewRef.current,
    );
  }, []);

  // ── Schedule save ──
  const scheduleSave = useCallback(() => {
    const path = savePathRef.current;
    if (!path || !sceneRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const s = sceneRef.current;
      const doc = {
        nodes: [...s.groups.map((g) => ({ ...g, type: "group" })), ...s.nodes],
        edges: s.edges.map((e) => ({
          id: e.id, fromNode: e.from, toNode: e.to,
          ...(e.fromSide ? { fromSide: e.fromSide } : {}),
          ...(e.toSide ? { toSide: e.toSide } : {}),
          ...(e.label ? { label: e.label } : {}),
        })),
      };
      invoke("save_canvas", { path, content: JSON.stringify(doc) }).catch(() => {});
    }, 800);
  }, []);

  // ── Delete selection ──
  const deleteSelection = useCallback(() => {
    const scene = sceneRef.current;
    const sel = selectedRef.current;
    if (sel.size === 0) return;
    scene.nodes = scene.nodes.filter((n) => !sel.has(n.id));
    scene.groups = scene.groups.filter((g) => !sel.has(g.id));
    scene.edges = scene.edges.filter((e) => !sel.has(e.from) && !sel.has(e.to));
    sel.clear();
    hoveredRef.current = null;
    rebuildIndex();
    pushGPU();
    pushAlphas();
    syncOverlayCb();
    scheduleSave();
  }, [rebuildIndex, pushGPU, pushAlphas, syncOverlayCb, scheduleSave]);

  // ── Create text card ──
  const createTextCard = useCallback((wx: number, wy: number) => {
    const scene = sceneRef.current;
    const id = nextId(scene);
    scene.nodes.push({
      id, type: "text", x: wx - 130, y: wy - 70, width: 260, height: 140, color: "", text: "",
    });
    indexRef.current.insert(id, { x: wx - 130, y: wy - 70, w: 260, h: 140 }, "node");
    selectedRef.current = new Set([id]);
    pushGPU();
    pushAlphas();
    syncOverlayCb();
    scheduleSave();
  }, [pushGPU, pushAlphas, syncOverlayCb, scheduleSave]);

  // ── Group selection ──
  const groupSelection = useCallback(() => {
    const scene = sceneRef.current;
    const sel = selectedRef.current;
    if (sel.size < 2) return;
    const items = [...scene.nodes, ...scene.groups].filter((el) => sel.has(el.id));
    const bounds = unionBounds(items);
    if (!bounds) return;
    const id = nextId(scene);
    const padding = 20;
    const group: SceneGroup = {
      id, x: bounds.x - padding, y: bounds.y - padding,
      width: bounds.w + padding * 2, height: bounds.h + padding * 2,
      color: "3", label: "Group",
    };
    scene.groups.push(group);
    indexRef.current.insert(id, sceneGroupAABB(group), "group");
    selectedRef.current = new Set([id]);
    pushGPU();
    pushAlphas();
    syncOverlayCb();
    scheduleSave();
  }, [pushGPU, pushAlphas, syncOverlayCb, scheduleSave]);

  // ── Hit-test via spatial index ──
  const hitTestWorld = useCallback((wx: number, wy: number): string | null => {
    const candidates = indexRef.current.queryPoint(wx, wy);
    if (candidates.length === 0) return null;
    const scene = sceneRef.current;
    const nodeIds = new Set(scene.nodes.map((n) => n.id));
    const nodeHit = candidates.filter((c) => nodeIds.has(c.id));
    if (nodeHit.length > 0) return nodeHit[nodeHit.length - 1].id;
    return candidates[candidates.length - 1].id;
  }, []);

  // ── Pointer handlers ──
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
    const v = viewRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { wx, wy } = worldPos(e, canvas, v);
    pointerStartRef.current = { x: e.clientX, y: e.clientY };

    // Edge creation: pointer near a side handle of hovered node.
    const hoveredId: string | null = hoveredRef.current;
    const hoveredNode = hoveredId !== null
      ? sceneRef.current.nodes.find((n) => n.id === hoveredId)
      : null;
    if (hoveredId !== null && hoveredNode && !e.shiftKey) {
      const side = nearestHandle(hoveredNode, sx, sy, v);
      if (side) {
        selectedRef.current = new Set([hoveredId]);
        const m = sideMidpoint(hoveredNode, side, v);
        edgeDraftRef.current = {
          fx: (m.x - v.ox) / v.scale, fy: (m.y - v.oy) / v.scale,
          tx: wx, ty: wy,
        };
        dragModeRef.current = { kind: "edge", fromId: hoveredId, fromSide: side };
        pushAlphas();
        syncOverlayCb();
        return;
      }
    }

    const hit = hitTestWorld(wx, wy);
    if (hit) {
      if (e.shiftKey) {
        const sel = new Set(selectedRef.current);
        if (sel.has(hit)) sel.delete(hit); else sel.add(hit);
        selectedRef.current = sel;
      } else if (!selectedRef.current.has(hit)) {
        selectedRef.current = new Set([hit]);
      }
      const allEls = [...sceneRef.current.groups, ...sceneRef.current.nodes];
      const offsets = new Map<string, { dx: number; dy: number }>();
      for (const id of selectedRef.current) {
        const el = allEls.find((x) => x.id === id);
        if (el) offsets.set(id, { dx: wx - el.x, dy: wy - el.y });
      }
      dragModeRef.current = { kind: "node", offsets };
    } else {
      if (!e.shiftKey) selectedRef.current = new Set();
      if (e.button === 1) {
        dragModeRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, startOx: v.ox, startOy: v.oy };
      } else {
        dragModeRef.current = { kind: "marquee", startX: sx, startY: sy, additive: e.shiftKey };
      }
    }
    pushAlphas();
    syncOverlayCb();
  }, [hitTestWorld, pushAlphas, syncOverlayCb]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const v = viewRef.current;
    const drag = dragModeRef.current;

    if (!drag) {
      // Hover detection.
      const { wx, wy } = worldPos(e, canvas, v);
      const hit = hitTestWorld(wx, wy);
      if (hit !== hoveredRef.current) {
        hoveredRef.current = hit;
        pushAlphas();
        syncOverlayCb();
      }
      // Cursor: crosshair near handle, grab on node, default otherwise.
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hoveredNode = hit ? sceneRef.current.nodes.find((n) => n.id === hit) : null;
      canvas.style.cursor = (hoveredNode && nearestHandle(hoveredNode, sx, sy, v))
        ? "crosshair"
        : hit ? "grab" : "default";
      return;
    }

    const ps = pointerStartRef.current;

    if (drag.kind === "pan") {
      v.ox = drag.startOx + (e.clientX - drag.startX);
      v.oy = drag.startOy + (e.clientY - drag.startY);
      rendererRef.current?.setView(v);
      syncOverlayCb();
      return;
    }

    if (drag.kind === "node") {
      if (ps) {
        const dx = e.clientX - ps.x;
        const dy = e.clientY - ps.y;
        if (dx * dx + dy * dy < MARQUEE_THRESHOLD * MARQUEE_THRESHOLD) return;
      }
      const { wx, wy } = worldPos(e, canvas, v);
      const allEls = [...sceneRef.current.groups, ...sceneRef.current.nodes];
      for (const id of selectedRef.current) {
        const offset = drag.offsets.get(id);
        const el = allEls.find((x) => x.id === id);
        if (offset && el) {
          el.x = wx - offset.dx;
          el.y = wy - offset.dy;
          const isNode = "type" in el;
          indexRef.current.insert(id, { x: el.x, y: el.y, w: el.width, h: el.height }, isNode ? "node" : "group");
        }
      }
      pushGPU();
      syncOverlayCb();
      return;
    }

    if (drag.kind === "marquee") {
      const marquee = marqueeRef.current;
      if (!marquee) return;
      const dx = e.clientX - canvas.getBoundingClientRect().left - drag.startX;
      const dy = e.clientY - canvas.getBoundingClientRect().top - drag.startY;
      if (dx * dx + dy * dy < MARQUEE_THRESHOLD * MARQUEE_THRESHOLD) {
        marquee.style.display = "none";
        return;
      }
      marquee.style.display = "";
      marquee.style.left = `${Math.min(drag.startX, drag.startX + dx)}px`;
      marquee.style.top = `${Math.min(drag.startY, drag.startY + dy)}px`;
      marquee.style.width = `${Math.abs(dx)}px`;
      marquee.style.height = `${Math.abs(dy)}px`;
      return;
    }

    if (drag.kind === "edge") {
      const { wx, wy } = worldPos(e, canvas, v);
      if (edgeDraftRef.current) {
        edgeDraftRef.current.tx = wx;
        edgeDraftRef.current.ty = wy;
      }
      syncOverlayCb();
    }
  }, [hitTestWorld, pushAlphas, pushGPU, syncOverlayCb]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) canvas.releasePointerCapture(e.pointerId);
    const drag = dragModeRef.current;
    dragModeRef.current = null;
    pointerStartRef.current = null;

    if (drag?.kind === "node") scheduleSave();

    if (drag?.kind === "marquee") {
      const marquee = marqueeRef.current;
      if (marquee && marquee.style.display !== "none") {
        const v = viewRef.current;
        const left = parseFloat(marquee.style.left);
        const top = parseFloat(marquee.style.top);
        const w = parseFloat(marquee.style.width);
        const h = parseFloat(marquee.style.height);
        const worldRect = {
          x: (Math.min(left, left + w) - v.ox) / v.scale,
          y: (Math.min(top, top + h) - v.oy) / v.scale,
          w: Math.abs(w) / v.scale,
          h: Math.abs(h) / v.scale,
        };
        const hitIds = indexRef.current.query(worldRect);
        if (drag.additive) {
          const sel = new Set(selectedRef.current);
          for (const id of hitIds) sel.add(id);
          selectedRef.current = sel;
        } else {
          selectedRef.current = new Set(hitIds);
        }
        marquee.style.display = "none";
        pushAlphas();
        syncOverlayCb();
      }
    }

    if (drag?.kind === "edge") {
      const { wx, wy } = worldPos(e, canvas!, viewRef.current);
      const hitId = hitTestWorld(wx, wy);
      if (hitId && hitId !== drag.fromId) {
        const scene = sceneRef.current;
        const id = nextId(scene);
        scene.edges.push({ id, from: drag.fromId, to: hitId, fromSide: drag.fromSide });
        pushGPU();
        syncOverlayCb();
        scheduleSave();
      }
      edgeDraftRef.current = null;
      syncOverlayCb();
    }
  }, [hitTestWorld, pushAlphas, scheduleSave, syncOverlayCb, pushGPU]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = viewRef.current;
    const factor = e.deltaY > 0 ? 1 / SCALE_STEP : SCALE_STEP;
    const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
    const ratio = ns / v.scale;
    v.ox = mx - (mx - v.ox) * ratio;
    v.oy = my - (my - v.oy) * ratio;
    v.scale = ns;
    rendererRef.current?.setView(v);
    pushGPU();
    syncOverlayCb();
  }, [pushGPU, syncOverlayCb]);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { wx, wy } = worldPos(e, canvas, viewRef.current);
    if (!hitTestWorld(wx, wy)) createTextCard(wx, wy);
  }, [hitTestWorld, createTextCard]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelection();
    } else if (e.key === "Escape") {
      selectedRef.current = new Set();
      hoveredRef.current = null;
      edgeDraftRef.current = null;
      pushAlphas();
      syncOverlayCb();
    }
  }, [deleteSelection, pushAlphas, syncOverlayCb]);

  const onContainerFocus = useCallback(() => {
    keybindingService.setContext("canvasFocused", true);
  }, []);

  const onContainerBlur = useCallback(() => {
    keybindingService.setContext("canvasFocused", false);
  }, []);

  return {
    canvasRef, containerRef, rendererRef, viewRef, rafRef, gpuDirtyRef,
    sceneRef, selectedRef, savePathRef, edgeDraftRef, marqueeRef,
    edgeLineRef, handleContainerRef, overlayRef, overlayNodesRef,
    rebuildIndex, pushGPU, pushAlphas, syncOverlay: syncOverlayCb, scheduleSave,
    deleteSelection, createTextCard, groupSelection,
    onPointerDown, onPointerMove, onPointerUp, onWheel, onDoubleClick,
    onKeyDown, onContainerFocus, onContainerBlur,
  };
}

