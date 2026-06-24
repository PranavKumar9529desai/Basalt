import { useEffect, useState } from "react";

/**
 * Tracks whether a CSS media query matches. Returns `true`/`false`.
 * Uses `window.matchMedia` under the hood.
 *
 * @example
 * ```tsx
 * const isMobile = useMediaQuery("(max-width: 640px)");
 * const isDark = useMediaQuery("(prefers-color-scheme: dark)");
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
