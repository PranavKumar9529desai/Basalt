// Canvas copy/paste wiring:
// - Ctrl/Cmd+C on a selection stores a node-JSON snapshot in the
//   feature-local typed store AND writes a plain-text form to the OS
//   clipboard (so copies also land in notes).
// - Ctrl/Cmd+V pastes the snapshot (offset + fresh ids → cascade) or, with
//   no snapshot, pulls an image / file / text from the OS clipboard and
//   creates canvas nodes — the same attach-and-embed pipeline as the editor.
// Window capture handlers so the pane works even when focus sits on a
// non-editable element (WebKitGTK emits no native copy/paste events then).

import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText as osWriteText } from "@tauri-apps/plugin-clipboard-manager";
import type { Edge, ReactFlowInstance } from "@xyflow/react";
import type { CanvasXYNode } from "../lib/mapper";
import { mapToXYFlow } from "../lib/mapper";
import type { CanvasDocument } from "../types";
import {
  CANVAS_NODES_KEY,
  buildCanvasSnapshot,
  classifyFileType,
  fileUriToPath,
  isEditableTarget,
  plainTextOfDocument,
  readCanvasTyped,
  readPastePayload,
  remapSnapshotForPaste,
  writeCanvasTyped,
} from "../lib/clipboard";
import type { CanvasClipboardSnapshot, PastePayload } from "../lib/clipboard";

interface SaveAttachmentResult {
  rel_path: string;
  abs_path: string;
  name: string;
}

export interface UseCanvasClipboardOptions {
  /** Active canvas tab — its path anchors attachment organization. */
  tab: { path: string };
  reactFlowInstance: ReactFlowInstance;
  containerRef: RefObject<HTMLDivElement | null>;
  setNodes: Dispatch<SetStateAction<CanvasXYNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  nodesRef: RefObject<CanvasXYNode[]>;
  edgesRef: RefObject<Edge[]>;
  saveCanvasNow: () => void;
}

export function useCanvasClipboard(opts: UseCanvasClipboardOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const appendDocument = useCallback((doc: CanvasDocument) => {
    const o = optsRef.current;
    const xy = mapToXYFlow(doc);
    o.setNodes((prev) => {
      const next = [...prev, ...xy.nodes.map((n) => ({ ...n, selected: true }))];
      o.nodesRef.current = next;
      return next;
    });
    o.setEdges((prev) => {
      const next = [...prev, ...xy.edges];
      o.edgesRef.current = next;
      o.saveCanvasNow();
      return next;
    });
  }, []);

  const appendNode = useCallback((node: CanvasXYNode) => {
    const o = optsRef.current;
    o.setNodes((prev) => {
      const next = [...prev, { ...node, selected: true }];
      o.nodesRef.current = next;
      o.saveCanvasNow();
      return next;
    });
  }, []);

  const flowCenter = useCallback(() => {
    const o = optsRef.current;
    return o.reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  }, []);

  const addLinkNode = useCallback(
    (url: string) => {
      const center = flowCenter();
      appendNode({
        id: `link-${Date.now()}`,
        type: "canvasLink",
        position: { x: center.x - 130, y: center.y - 50 },
        style: { width: 260, height: 100 },
        data: { url },
      });
    },
    [appendNode, flowCenter],
  );

  const addTextNode = useCallback(
    (text: string) => {
      const center = flowCenter();
      appendNode({
        id: `text-${Date.now()}`,
        type: "canvasText",
        position: { x: center.x - 125, y: center.y - 70 },
        style: { width: 250, height: 140 },
        data: { text },
      });
    },
    [appendNode, flowCenter],
  );

  const addFileNode = useCallback(
    (relPath: string, fileType: "image" | "audio" | "file") => {
      const center = flowCenter();
      const width = fileType === "image" ? 360 : fileType === "audio" ? 320 : 380;
      const height = fileType === "image" ? 280 : fileType === "audio" ? 120 : 260;
      appendNode({
        id: `file-${Date.now()}`,
        type: "canvasFile",
        position: { x: center.x - width / 2, y: center.y - height / 2 },
        style: { width, height },
        data: { file: relPath },
      });
    },
    [appendNode, flowCenter],
  );

  const pastePayload = useCallback(
    async (payload: PastePayload) => {
      const o = optsRef.current;
      if (payload.image) {
        try {
          const res = await invoke<SaveAttachmentResult>("save_attachment", {
            name: payload.image.name,
            data: Array.from(payload.image.bytes),
            notePath: o.tab.path,
          });
          if (res?.rel_path) addFileNode(res.rel_path, "image");
        } catch (err) {
          console.error("Canvas paste: failed to save image", err);
        }
        return;
      }
      if (payload.uris.length > 0) {
        for (const uri of payload.uris) {
          try {
            const res = await invoke<SaveAttachmentResult>(
              "copy_attachment_from_path",
              { sourcePath: fileUriToPath(uri), notePath: o.tab.path },
            );
            if (res?.rel_path) {
              addFileNode(res.rel_path, classifyFileType(res.rel_path));
            }
          } catch (err) {
            console.error("Canvas paste: failed to copy file", err);
          }
        }
        return;
      }
      const text = payload.text.trim();
      if (text) {
        if (/^https?:\/\//i.test(text)) {
          addLinkNode(text);
        } else {
          addTextNode(text);
        }
      }
    },
    [addFileNode, addLinkNode, addTextNode],
  );

  /** Paste right now — snapshot first (canvas × canvas), then the OS
   *  clipboard. Also the context-menu "Paste" handler. */
  const handlePasteNow = useCallback(async () => {
    const snapshot =
      readCanvasTyped<CanvasClipboardSnapshot>(CANVAS_NODES_KEY);
    if (snapshot && snapshot.v === 1 && snapshot.doc.nodes?.length) {
      appendDocument(remapSnapshotForPaste(snapshot));
      return;
    }
    pastePayload(await readPastePayload(null));
  }, [appendDocument, pastePayload]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "v") return;

      const o = optsRef.current;
      const dom = o.containerRef.current;
      if (!dom || !dom.contains(e.target as Node | null)) return;
      if (isEditableTarget(e.target)) return;

      if (key === "c") {
        const snapshot = buildCanvasSnapshot(
          o.nodesRef.current ?? [],
          o.edgesRef.current ?? [],
        );
        if (!snapshot) return;
        e.preventDefault();
        e.stopPropagation();
        writeCanvasTyped(CANVAS_NODES_KEY, snapshot);
        void osWriteText(plainTextOfDocument(snapshot.doc)).catch(() => {});
      } else {
        e.preventDefault();
        e.stopPropagation();
        void handlePasteNow();
      }
    },
    [handlePasteNow],
  );

  useEffect(() => {
    // Clicking the pane focuses the container (capture phase) so the
    // keydown copy/paste handler below sees a target inside it. Editable
    // targets (link URL input, card editor) keep their own focus.
    const onPointerDown = (e: PointerEvent) => {
      const o = optsRef.current;
      const dom = o.containerRef.current;
      if (!dom) return;
      if (!(e.target instanceof Node) || !dom.contains(e.target)) return;
      if (isEditableTarget(e.target)) return;
      dom.focus();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  return { handlePasteNow };
}