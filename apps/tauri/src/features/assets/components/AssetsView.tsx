import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@workspace/ui/components/ui/tooltip";
import { useAssetsStore, useFilteredAssets, useAssetsActions } from "../store";
import type { AssetFilter } from "../types";
import { AssetRow } from "./AssetRow";

const FILTER_TABS: { key: AssetFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "image", label: "Images" },
  { key: "audio", label: "Audio" },
  { key: "video", label: "Video" },
  { key: "document", label: "Docs" },
  { key: "other", label: "Other" },
];

export function AssetsView() {
  const filter = useAssetsStore((s) => s.filter);
  const search = useAssetsStore((s) => s.search);
  const showDuplicatesOnly = useAssetsStore((s) => s.showDuplicatesOnly);
  const showOrphansOnly = useAssetsStore((s) => s.showOrphansOnly);
  const loading = useAssetsStore((s) => s.loading);
  const auditReport = useAssetsStore((s) => s.auditReport);

  const { setFilter, setSearch, setShowDuplicatesOnly, setShowOrphansOnly } =
    useAssetsStore.getState();
  const { refresh, runCleanup, runReorganize } = useAssetsActions();
  const filteredAssets = useFilteredAssets();
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rowVirtualizer = useVirtualizer({
    count: filteredAssets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const handleOpen = async (absPath: string) => {
    try {
      await openPath(absPath);
    } catch (err) {
      console.error("[assets] open failed:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--sat-surface-1)] overflow-hidden">
      {/* Audit summary bar */}
      {auditReport && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--sat-layout-border)] text-[10px] text-[var(--sat-text-muted)] shrink-0">
          <span>{filteredAssets.length} assets</span>
          {auditReport.orphan_count > 0 && (
            <span className="text-[var(--sat-state-warning,#f59e0b)]">
              {auditReport.orphan_count} orphan
              {auditReport.orphan_count !== 1 && "s"}
            </span>
          )}
          {auditReport.duplicate_count > 0 && (
            <span className="text-[var(--sat-state-error,#ef4444)]">
              {auditReport.duplicate_count} dup
              {auditReport.duplicate_count !== 1 && "s"}
            </span>
          )}
          {auditReport.orphan_count > 0 || auditReport.duplicate_count > 0 ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={runCleanup}
                    aria-label="Delete orphaned assets and consolidate duplicates"
                    className="ml-auto px-2 py-0.5 text-[10px] bg-[var(--sat-state-error,#ef4444)]/15 text-[var(--sat-state-error,#ef4444)] hover:bg-[var(--sat-state-error,#ef4444)]/25"
                  >
                    Clean up
                  </Button>
                }
              />
              <TooltipContent>
                Delete orphaned assets and consolidate duplicates
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={runReorganize}
                    aria-label="Apply current organization/naming rules to every attachment"
                    className="ml-auto px-2 py-0.5 text-[10px] bg-[var(--sat-accent-primary)]/15 text-[var(--sat-accent-primary)] hover:bg-[var(--sat-accent-primary)]/25"
                  >
                    Reorganize
                  </Button>
                }
              />
              <TooltipContent>
                Apply current organization/naming rules to every attachment
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-[var(--sat-layout-border)] shrink-0">
        {FILTER_TABS.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            variant={filter === tab.key ? "sat-primary" : "ghost"}
            onClick={() => setFilter(tab.key)}
            className={`px-2 py-0.5 text-[10px] ${
              filter !== tab.key &&
              "text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-2)]"
            }`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Search + toggles */}
      <div className="flex items-center gap-1 px-2 py-1.5 shrink-0">
        <input
          type="text"
          placeholder="Filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded bg-[var(--sat-surface-2)] px-2 py-1 text-xs text-[var(--sat-text-primary)] placeholder:text-[var(--sat-text-muted)] outline-none focus:ring-1 focus:ring-[var(--sat-accent-primary)]"
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowOrphansOnly(!showOrphansOnly)}
                className={`px-1.5 py-0.5 text-[10px] ${
                  showOrphansOnly
                    ? "bg-[var(--sat-state-warning,#f59e0b)]/20 text-[var(--sat-state-warning,#f59e0b)]"
                    : "text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-2)]"
                }`}
                aria-label="Show only orphaned assets"
              >
                🏷
              </Button>
            }
          />
          <TooltipContent>Show only orphaned assets</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                className={`px-1.5 py-0.5 text-[10px] ${
                  showDuplicatesOnly
                    ? "bg-[var(--sat-state-error,#ef4444)]/20 text-[var(--sat-state-error,#ef4444)]"
                    : "text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-2)]"
                }`}
                aria-label="Show only duplicates"
              >
                ⧉
              </Button>
            }
          />
          <TooltipContent>Show only duplicates</TooltipContent>
        </Tooltip>
      </div>

      {/* Virtualized list */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-xs text-[var(--sat-text-muted)] text-center">
            Loading…
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="p-4 text-xs text-[var(--sat-text-muted)] text-center">
            No assets found
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const asset = filteredAssets[virtualRow.index];
              return (
                <div
                  key={asset.abs_path}
                  className="absolute w-full"
                  style={{
                    top: virtualRow.start,
                    height: virtualRow.size,
                  }}
                >
                  <AssetRow asset={asset} onOpen={handleOpen} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
