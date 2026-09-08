/**
 * Gesture types and interfaces for workspace gesture interactions.
 */

export type GestureType =
  | "mouse-aux-back"
  | "mouse-aux-forward"
  | "swipe-back"
  | "swipe-forward"
  | (string & {});

export interface GestureEvent {
  type: GestureType;
  originalEvent: MouseEvent | WheelEvent | TouchEvent;
  timestamp: number;
}

export type GestureHandler = (event: GestureEvent) => void;

export interface GestureRecognizer {
  name: string;
  attach: (dispatcher: (event: GestureEvent) => void) => () => void;
}
