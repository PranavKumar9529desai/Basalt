/**
 * GestureService — Scalable gesture detection and dispatch engine.
 *
 * Architecture: Owns global event listeners for mouse auxiliary buttons (X1/X2)
 * and trackpad horizontal navigation swipes. Dispatches typed gesture events
 * and executes corresponding workspace commands.
 *
 * Designed to scale: new gesture recognizers (e.g. edge touch gestures,
 * right-click mouse movement gestures) can be registered via `registerRecognizer`.
 */
import { commandService } from "@workspace/commands";
import type {
  GestureEvent,
  GestureHandler,
  GestureRecognizer,
  GestureType,
} from "./types";

export class GestureService {
  private handlers = new Map<GestureType, Set<GestureHandler>>();
  private recognizers: GestureRecognizer[] = [];
  private cleanups: Array<() => void> = [];
  private isAttached = false;

  constructor() {
    this.registerDefaultRecognizers();
    this.registerDefaultHandlers();
  }

  private registerDefaultRecognizers(): void {
    // 1. Mouse auxiliary buttons: Back (button 3) and Forward (button 4)
    this.registerRecognizer({
      name: "mouse-aux-buttons",
      attach: (dispatch) => {
        const handleMouseEvent = (e: MouseEvent) => {
          if (e.button === 3) {
            e.preventDefault();
            e.stopPropagation();
            if (e.type === "mouseup" || e.type === "auxclick") {
              dispatch({
                type: "mouse-aux-back",
                originalEvent: e,
                timestamp: Date.now(),
              });
            }
          } else if (e.button === 4) {
            e.preventDefault();
            e.stopPropagation();
            if (e.type === "mouseup" || e.type === "auxclick") {
              dispatch({
                type: "mouse-aux-forward",
                originalEvent: e,
                timestamp: Date.now(),
              });
            }
          }
        };

        // Capture phase to intercept before WebView / browser default navigation
        window.addEventListener("mousedown", handleMouseEvent, {
          capture: true,
        });
        window.addEventListener("mouseup", handleMouseEvent, { capture: true });
        window.addEventListener("auxclick", handleMouseEvent, {
          capture: true,
        });

        return () => {
          window.removeEventListener("mousedown", handleMouseEvent, {
            capture: true,
          });
          window.removeEventListener("mouseup", handleMouseEvent, {
            capture: true,
          });
          window.removeEventListener("auxclick", handleMouseEvent, {
            capture: true,
          });
        };
      },
    });

    // 2. Trackpad / 2-finger horizontal swipe navigation recognizer
    this.registerRecognizer({
      name: "trackpad-horizontal-swipe",
      attach: (dispatch) => {
        let accumulatedDeltaX = 0;
        let lastGestureTime = 0;
        const SWIPE_THRESHOLD = 50; // px
        const GESTURE_COOLDOWN_MS = 600;

        const handleWheel = (e: WheelEvent) => {
          const now = Date.now();
          if (now - lastGestureTime < GESTURE_COOLDOWN_MS) {
            return;
          }

          // Check if horizontal scroll is dominant
          const absX = Math.abs(e.deltaX);
          const absY = Math.abs(e.deltaY);

          // If mostly vertical or modifier held, reset accumulator
          if (absY > absX || e.ctrlKey || e.metaKey || e.shiftKey) {
            accumulatedDeltaX = 0;
            return;
          }

          // Check if user is scrolling inside an element with horizontal overflow
          let target =
            typeof Element !== "undefined" && e.target instanceof Element
              ? (e.target as HTMLElement)
              : null;
          let hasHorizontalScrollableAncestor = false;
          while (
            target &&
            target !== document.body &&
            target !== document.documentElement
          ) {
            try {
              const style = window.getComputedStyle(target);
              const overflowX = style?.overflowX;
              if (
                (overflowX === "auto" || overflowX === "scroll") &&
                target.scrollWidth > target.clientWidth
              ) {
                const canScrollLeft = target.scrollLeft > 0;
                const canScrollRight =
                  target.scrollLeft < target.scrollWidth - target.clientWidth;
                if (
                  (e.deltaX < 0 && canScrollLeft) ||
                  (e.deltaX > 0 && canScrollRight)
                ) {
                  hasHorizontalScrollableAncestor = true;
                  break;
                }
              }
            } catch {
              // Ignore style inspection error on detached/mock elements
            }
            target = target.parentElement;
          }

          if (hasHorizontalScrollableAncestor) {
            accumulatedDeltaX = 0;
            return;
          }

          accumulatedDeltaX += e.deltaX;

          if (accumulatedDeltaX <= -SWIPE_THRESHOLD) {
            // Swiped right (scroll left) -> Navigate Back
            lastGestureTime = now;
            accumulatedDeltaX = 0;
            dispatch({
              type: "swipe-back",
              originalEvent: e,
              timestamp: now,
            });
          } else if (accumulatedDeltaX >= SWIPE_THRESHOLD) {
            // Swiped left (scroll right) -> Navigate Forward
            lastGestureTime = now;
            accumulatedDeltaX = 0;
            dispatch({
              type: "swipe-forward",
              originalEvent: e,
              timestamp: now,
            });
          }
        };

        window.addEventListener("wheel", handleWheel, { passive: true });
        return () => window.removeEventListener("wheel", handleWheel);
      },
    });
  }

  private registerDefaultHandlers(): void {
    this.on("mouse-aux-back", () => {
      commandService.execute("tabs:navigate-back");
    });
    this.on("mouse-aux-forward", () => {
      commandService.execute("tabs:navigate-forward");
    });
    this.on("swipe-back", () => {
      commandService.execute("tabs:navigate-back");
    });
    this.on("swipe-forward", () => {
      commandService.execute("tabs:navigate-forward");
    });
  }

  registerRecognizer(recognizer: GestureRecognizer): void {
    this.recognizers.push(recognizer);
    if (this.isAttached) {
      const cleanup = recognizer.attach(this.dispatch);
      this.cleanups.push(cleanup);
    }
  }

  on(type: GestureType, handler: GestureHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  dispatch = (event: GestureEvent): void => {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(
            `[GestureService] Error executing handler for ${event.type}:`,
            err,
          );
        }
      }
    }
  };

  start(): () => void {
    if (this.isAttached) return () => this.stop();
    this.isAttached = true;
    for (const recognizer of this.recognizers) {
      const cleanup = recognizer.attach(this.dispatch);
      this.cleanups.push(cleanup);
    }
    return () => this.stop();
  }

  stop(): void {
    if (!this.isAttached) return;
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch (err) {
        console.error("[GestureService] Error during cleanup:", err);
      }
    }
    this.cleanups = [];
    this.isAttached = false;
  }
}

export const gestureService = new GestureService();
