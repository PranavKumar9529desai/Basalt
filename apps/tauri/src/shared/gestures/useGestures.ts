import { useEffect } from "react";
import { gestureService } from "./GestureService";

/**
 * Mount the workspace-wide GestureService listeners.
 * Should be mounted once at the workspace shell root.
 */
export function useGestures(): void {
  useEffect(() => {
    const stop = gestureService.start();
    return stop;
  }, []);
}
