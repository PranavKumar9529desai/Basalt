// Canvas palette commands — registered at import time via side-effect import
// in features/canvas/index.ts. The active CanvasView sets the handle on
// mount; commands no-op when no canvas is active.

import { commandService } from "@workspace/commands";

export interface CanvasCommandHandle {
  groupSelection: () => void;
  deleteSelection: () => void;
  selectionCount: () => number;
}

let active: CanvasCommandHandle | null = null;

export function setActiveCanvas(h: CanvasCommandHandle | null): void {
  active = h;
}

commandService.registerCommand(
  "canvas:group-selection",
  () => {
    active?.groupSelection();
  },
  () => active !== null && active.selectionCount() >= 2,
);

commandService.registerCommand(
  "canvas:delete-selection",
  () => {
    active?.deleteSelection();
  },
  () => active !== null && active.selectionCount() > 0,
);
