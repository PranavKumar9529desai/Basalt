import { act } from "@testing-library/react";
import { vi } from "vitest";
import type {
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import { useTabsStore } from "../../store";
import { createLeaf } from "../../lib/layoutTree";
import { useTabDnD } from "../useTabDnD";

export function dragEvent(): ReactDragEvent<HTMLElement> {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      setData: vi.fn(),
      getData: () => "",
      effectAllowed: "",
      dropEffect: "",
    },
  } as unknown as ReactDragEvent<HTMLElement>;
}

export function seedPane(tabIds: string[]) {
  const moveTabWithinPane = vi.fn();
  const activateTab = vi.fn();
  let leafId = "";
  act(() => {
    const leaf = createLeaf(tabIds);
    leafId = leaf.id;
    useTabsStore.setState({
      tabs: {},
      root: leaf,
      activePaneId: leaf.id,
      moveTabWithinPane,
      activateTab,
    });
  });
  return { moveTabWithinPane, activateTab, paneId: leafId };
}

// --- Pointer-drag helpers (the WebKitGTK path uses real window listeners and
// DOM hit-testing, so tests drive those directly). ---

const pointerEvent = (
  type: string,
  x: number,
  y: number,
  opts: Partial<MouseEventInit> = {},
) => new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...opts });

let handlers_handlePointerDown: PointerDownFn = () => undefined;

export function pointerDown(tabId: string, x: number, y: number) {
  act(() => {
    handlers_handlePointerDown(tabId, x, y);
  });
}

// jsdom has no elementFromPoint; stub it per-call via a mutable cell.
let hitTarget: HTMLElement | null = null;
export function setHit(
  el: HTMLElement | null,
  rect?: { left?: number; top?: number; width?: number; height?: number },
) {
  hitTarget = el;
  if (el && rect) {
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 24, ...rect }) as DOMRect;
  }
}

function stubElementFromPoint() {
  (
    document as unknown as { elementFromPoint: () => HTMLElement | null }
  ).elementFromPoint = () => hitTarget;
}

/** beforeEach reset: clear the hit target and re-stub elementFromPoint. */
export function resetHitTesting() {
  hitTarget = null;
  stubElementFromPoint();
}

export function makeEl(attrs: Record<string, string>) {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) {
    const dataKey = k.replace(/([A-Z])/g, "-$1").toLowerCase();
    el.setAttribute(`data-${dataKey}`, v);
  }
  return el;
}

type PointerDownFn = (tabId: string, x: number, y: number) => void;

export function hookHandlePointerDown(result: {
  current: ReturnType<typeof useTabDnD>;
}) {
  handlers_handlePointerDown = (tabId, x, y) =>
    result.current.handleTabPointerDown(tabId, {
      button: 0,
      clientX: x,
      clientY: y,
    } as unknown as ReactPointerEvent<HTMLElement>);
}

export function pointerMove(x: number, y: number) {
  act(() => window.dispatchEvent(pointerEvent("pointermove", x, y)));
}

export function pointerUp(x: number, y: number) {
  act(() => window.dispatchEvent(pointerEvent("pointerup", x, y)));
}
