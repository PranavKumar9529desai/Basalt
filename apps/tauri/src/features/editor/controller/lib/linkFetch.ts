import { openUrl } from "@tauri-apps/plugin-opener";
import type { LeafServices } from "@workspace/views";

/**
 * Resolve a wikilink/embed target by name: the bare name first, then the
 * `.md` stem as fallback. Returns the found note or undefined.
 */
export function resolveLinkedNote(
  linkName: string,
  services: Pick<LeafServices, "findNote">,
): { name: string; path: string } | undefined {
  return (
    services.findNote(linkName) ?? services.findNote(`${linkName}.md`)
  );
}

/** Open a wikilink/embed target note, or report the miss through `setStatus`
 * (the live status surface — never a thrown error). */
export function openLinkedNote(
  linkName: string,
  services: Pick<LeafServices, "findNote" | "openNote">,
  setStatus: (status: string | null) => void,
): void {
  const target = resolveLinkedNote(linkName, services);
  if (target) {
    services.openNote(target.path);
  } else {
    setStatus(`Could not find linked note: "${linkName}"`);
  }
}

/** Open an external http(s) link in the system browser (Tauri opener plugin) —
 * never `window.open` in the WebView. */
export function openExternalUrl(url: string): void {
  void openUrl(url);
}