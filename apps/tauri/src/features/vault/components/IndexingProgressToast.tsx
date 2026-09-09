import { IndexingToast } from "@workspace/ui/components/indexing-toast";
import { useIndexingProgress } from "../hooks/useIndexingProgress";

/**
 * Connected toast component that wires the vault indexing event stream
 * into the dumb UI IndexingToast component.
 */
export function IndexingProgressToast() {
  const { isIndexing, isComplete, total, indexed, percentage, dismiss } =
    useIndexingProgress();

  if (!isIndexing && !isComplete) {
    return null;
  }

  return (
    <IndexingToast
      total={total}
      indexed={indexed}
      percentage={percentage}
      isComplete={isComplete}
      onDismiss={dismiss}
    />
  );
}
