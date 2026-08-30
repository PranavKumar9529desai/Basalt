import { BacklinksSidebar } from "../../features/vault";
import { useWorkspaceContext } from "../WorkspaceProvider";

/**
 * Backlinks view — the right dock's registered view.
 * Reads the focused note's backlinks and opens notes through the
 * workspace context (the sanctioned cross-feature seam).
 */
export function BacklinksView() {
  const { activeNoteBacklinks, openNote } = useWorkspaceContext();

  return (
    <BacklinksSidebar
      backlinks={activeNoteBacklinks}
      onOpenNote={({ path }) => openNote(path)}
    />
  );
}
