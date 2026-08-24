import { useActiveNoteStore } from "../../features/editor";
import { BacklinksSidebar } from "../../features/vault";
import { useWorkspaceContext } from "../WorkspaceProvider";

/**
 * Backlinks view — the right dock's registered view (ADR-018).
 * Reads the focused note's backlinks directly from the editor store
 * and opens notes through the workspace context.
 */
export function BacklinksView() {
  const backlinks = useActiveNoteStore((s) => s.activeNoteBacklinks);
  const { openNote } = useWorkspaceContext();

  return (
    <BacklinksSidebar
      backlinks={backlinks}
      onOpenNote={({ path }) => openNote(path)}
    />
  );
}
