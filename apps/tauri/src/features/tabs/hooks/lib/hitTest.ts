import type { DropTarget } from "./dragState";
import { draggedTab } from "./dragState";

/** Resolve the drop target under a cursor position via real DOM hit-testing
 * (elementFromPoint was chosen over geometric store math because the DOM is
 * the single source of truth for where pills/panes actually are). */
export function hitTestDropTarget(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y);
  if (!el || !(el instanceof Element)) return null;

  // A tab pill: the slot is the half of the pill under the cursor.
  const pill = el.closest<HTMLElement>("[data-tab-id]");
  if (pill) {
    const tabId = pill.dataset.tabId;
    const paneId = pill.dataset.tabPaneId;
    if (tabId && paneId && draggedTab && tabId !== draggedTab.tabId) {
      const rect = pill.getBoundingClientRect();
      const edge: "left" | "right" =
        x < rect.left + rect.width / 2 ? "left" : "right";
      return { kind: "tab", tabId, edge, paneId };
    }
    return null;
  }

  // The tab strip gutter (between pills / past the last pill): snap to the
  // nearest pill's edge so reorder targets are reachable without pixel-perfect
  // aim on the pills themselves.
  const tablist = el.closest<HTMLElement>("[role=tablist]");
  if (tablist) {
    let best: { pill: HTMLElement; center: number } | null = null;
    for (const pillEl of tablist.querySelectorAll<HTMLElement>(
      "[data-tab-id]",
    )) {
      const rect = pillEl.getBoundingClientRect();
      if (rect.width <= 0) continue;
      const center = rect.left + rect.width / 2;
      if (!best || Math.abs(x - center) < Math.abs(x - best.center)) {
        best = { pill: pillEl, center };
      }
    }
    if (best) {
      const tabId = best.pill.dataset.tabId;
      const paneId = best.pill.dataset.tabPaneId;
      if (tabId && paneId && draggedTab && tabId !== draggedTab.tabId) {
        const rect = best.pill.getBoundingClientRect();
        const edge: "left" | "right" =
          x < rect.left + rect.width / 2 ? "left" : "right";
        return { kind: "tab", tabId, edge, paneId };
      }
    }
    return null;
  }

  // A pane body (or an empty leaf's whole area): edges split, center moves.
  const body = el.closest<HTMLElement>("[data-basalt-pane-body]");
  if (body) {
    const paneId = body.dataset.paneId;
    if (!paneId) return null;
    const rect = body.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const midLeft = rect.left + rect.width * 0.25;
    const midRight = rect.left + rect.width * 0.75;
    const topBand = rect.top + rect.height * 0.33;
    const bottomBand = rect.top + rect.height * 0.66;
    if (x < midLeft) return { kind: "edge", edge: "left", paneId };
    if (x > midRight) return { kind: "edge", edge: "right", paneId };
    if (y < topBand) return { kind: "edge", edge: "top", paneId };
    if (y > bottomBand) return { kind: "edge", edge: "bottom", paneId };
    return { kind: "pane-body", paneId };
  }

  return null;
}
