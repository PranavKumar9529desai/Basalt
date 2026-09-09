import { beforeEach, describe, expect, it, vi } from "vitest";
import { commandService } from "@workspace/commands";
import { GestureService } from "./GestureService";

describe("GestureService", () => {
  let service: GestureService;

  beforeEach(() => {
    service = new GestureService();
  });

  it("registers default recognizers and handlers", () => {
    const executed: string[] = [];
    vi.spyOn(commandService, "execute").mockImplementation((cmd) => {
      executed.push(cmd);
    });

    service.start();

    // Test mouse button 3 (Back)
    const backDown = new MouseEvent("mousedown", {
      button: 3,
      cancelable: true,
    });
    window.dispatchEvent(backDown);
    expect(backDown.defaultPrevented).toBe(true);

    const backUp = new MouseEvent("mouseup", { button: 3, cancelable: true });
    window.dispatchEvent(backUp);
    expect(backUp.defaultPrevented).toBe(true);
    expect(executed).toContain("tabs:navigate-back");

    // Test mouse button 4 (Forward)
    const fwdUp = new MouseEvent("mouseup", { button: 4, cancelable: true });
    window.dispatchEvent(fwdUp);
    expect(fwdUp.defaultPrevented).toBe(true);
    expect(executed).toContain("tabs:navigate-forward");

    service.stop();
  });

  it("handles 2-finger horizontal trackpad swipe navigation", () => {
    const executed: string[] = [];
    vi.spyOn(commandService, "execute").mockImplementation((cmd) => {
      executed.push(cmd);
    });

    service.start();

    // Swipe right (negative deltaX) -> Back
    const swipeRight = new WheelEvent("wheel", { deltaX: -60, deltaY: 0 });
    window.dispatchEvent(swipeRight);
    expect(executed).toContain("tabs:navigate-back");

    // Clear and test swipe left (positive deltaX) after cooldown
    executed.length = 0;
    vi.setSystemTime(Date.now() + 1000);

    const swipeLeft = new WheelEvent("wheel", { deltaX: 60, deltaY: 0 });
    window.dispatchEvent(swipeLeft);
    expect(executed).toContain("tabs:navigate-forward");

    service.stop();
  });

  it("allows registering custom gesture recognizers and handlers", () => {
    const customEvents: string[] = [];
    service.on("custom-gesture", () => {
      customEvents.push("triggered");
    });

    service.registerRecognizer({
      name: "custom-recognizer",
      attach: (dispatch) => {
        dispatch({
          type: "custom-gesture",
          originalEvent: new MouseEvent("click"),
          timestamp: Date.now(),
        });
        return () => {};
      },
    });

    service.start();
    expect(customEvents).toEqual(["triggered"]);
    service.stop();
  });
});
