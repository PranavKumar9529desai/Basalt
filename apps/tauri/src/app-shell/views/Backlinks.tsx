import { BacklinksSidebar } from "../../features/vault";
import { useAppContext } from "../AppProvider";

/**
 * Backlinks view — the right dock's registered view.
 * Reads the focused note's backlinks and opens notes through the
 * workspace context (the sanctioned cross-feature seam).
 */
export function Backlinks() {
  const { activeNoteBacklinks, openNote } = useAppContext();

  return (
    <BacklinksSidebar
      backlinks={activeNoteBacklinks}
      onOpenNote={({ path }) => openNote(path)}
    />
  );
}
