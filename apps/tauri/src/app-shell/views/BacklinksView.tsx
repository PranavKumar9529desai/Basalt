import { useFocusedPaneStore } from "../../features/editor";
import { BacklinksSidebar } from "../../features/vault";
import { useWorkspaceContext } from "../WorkspaceProvider";

/**
 * Backlinks view — the right dock's registered view (ADR-018).
 * Reads the focused note's backlinks directly from the editor store
 * and opens notes through the workspace context.
 */
export function BacklinksView() {
  const backlinks = useFocusedPaneStore((s) => s.focusedPaneBacklinks);
  const { openNotePreview } = useWorkspaceContext();

  return (
    <BacklinksSidebar
      backlinks={backlinks}
      onOpenNote={({ path }) => openNotePreview(path)}
    />
  );
}
