import { useSearchStore } from "../../features/search";
import { TagsSidebar } from "../../features/vault/components/TagsSidebar";

/**
 * Right-dock Tags section (ADR-018 view registry). Shell glue only: the
 * sidebar owns its own data (vault IPC); this view supplies the
 * cross-feature "open search with `tag:<tag>`" action.
 */
export function Tags() {
  const openSearchWithQuery = useSearchStore((s) => s.openSearchWithQuery);
  return (
    <TagsSidebar onOpenTag={(tag) => void openSearchWithQuery(`tag:${tag}`)} />
  );
}
