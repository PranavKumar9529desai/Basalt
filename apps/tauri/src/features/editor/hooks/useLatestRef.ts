import { useRef } from "react";

/**
 * Always-fresh ref without a dedicated useEffect — syncs on every render.
 * Use it to read the latest value from stable callbacks (timers, CM
 * listeners) without re-creating them.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
