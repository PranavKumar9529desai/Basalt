import type { AssetInfo } from "../types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_ICONS: Record<string, string> = {
  image: "🖼",
  video: "🎬",
  audio: "🎵",
  document: "📄",
  other: "📎",
};

interface AssetRowProps {
  asset: AssetInfo;
  onOpen?: (path: string) => void;
}

export function AssetRow({ asset, onOpen }: AssetRowProps) {
  const totalRefs = asset.embeds_by.length + asset.linked_by.length;
  const isOrphan = totalRefs === 0;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(asset.abs_path)}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--sat-surface-2)] group"
    >
      <span className="text-sm shrink-0" title={asset.file_type}>
        {TYPE_ICONS[asset.file_type] ?? "📎"}
      </span>

      <span className="flex-1 truncate text-xs text-[var(--sat-text-primary)]">
        {asset.file_name}
      </span>

      <span className="shrink-0 text-[10px] text-[var(--sat-text-muted)] tabular-nums">
        {formatSize(asset.size_bytes)}
      </span>

      {totalRefs > 0 && (
        <span className="shrink-0 rounded bg-[var(--sat-surface-3)] px-1 py-px text-[10px] text-[var(--sat-text-muted)] tabular-nums">
          {totalRefs}
        </span>
      )}

      {isOrphan && (
        <span
          className="shrink-0 rounded bg-[var(--sat-state-warning,#f59e0b)]/20 px-1 py-px text-[10px] text-[var(--sat-state-warning,#f59e0b)]"
          title="Not referenced by any note"
        >
          orphan
        </span>
      )}
    </button>
  );
}
