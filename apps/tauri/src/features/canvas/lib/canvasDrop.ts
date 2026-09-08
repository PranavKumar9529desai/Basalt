/**
 * canvasDrop — registry of live canvas drop targets.
 *
 * The infinite canvas (ADR-035) is a ReactFlow pane per leaf. File-tree drags
 * run on pointer events (WebKitGTK never fires HTML5 dragstart), so the
 * canvas's native `onDrop` never sees them. Instead each mounted CanvasFlow
 * registers a handler here against its DOM element; the shared fileDnd layer
 * hit-tests the drop point against the registered panes and routes the drop
 * to the one under the cursor.
 *
 * Keyed by paneId with keyed unregister so closing one canvas can never clear
 * another's registration.
 */

export interface CanvasFileDropPayload {
  x: number;
  y: number;
  /** Absolute path of the dropped note/asset. */
  filePath: string;
}

type CanvasFileDropHandler = (payload: CanvasFileDropPayload) => void;

interface Registration {
  dom: HTMLElement;
  handler: CanvasFileDropHandler;
}

const registrations = new Map<string, Registration>();

/** Register a canvas pane as a file-drop target. Returns the unregister fn. */
export function registerCanvasFileDrop(
  paneId: string,
  dom: HTMLElement,
  handler: CanvasFileDropHandler,
): () => void {
  registrations.set(paneId, { dom, handler });
  return () => {
    registrations.delete(paneId);
  };
}

/** Route a drop at screen (x, y) to the canvas pane under it. Returns true if
 *  a pane accepted the drop. */
export function canvasFileDropAt(x: number, y: number, filePath: string): boolean {
  for (const { dom, handler } of registrations.values()) {
    const r = dom.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      handler({ x, y, filePath });
      return true;
    }
  }
  return false;
}