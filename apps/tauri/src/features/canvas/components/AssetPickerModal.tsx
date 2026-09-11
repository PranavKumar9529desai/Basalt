import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  IconSearch,
  IconPhoto,
  IconVideo,
  IconVolume,
  IconFileCode,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";

export interface AssetInfo {
  rel_path: string;
  abs_path: string;
  file_name: string;
  file_type: "image" | "video" | "audio" | "document" | "other";
  mime_type: string;
  size_bytes: number;
}

export interface AssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: AssetInfo) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILTER_TYPES = ["all", "image", "video", "audio", "document"] as const;

export function AssetPickerModal({
  isOpen,
  onClose,
  onSelect,
}: AssetPickerModalProps) {
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setFilterType("all");
      setSelectedIndex(0);
      return;
    }

    let isMounted = true;
    invoke<AssetInfo[]>("get_assets")
      .then((res) => {
        if (isMounted) {
          setAssets(res || []);
          setSelectedIndex(0);
        }
      })
      .catch((err) => {
        console.error("Failed to load vault assets:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (filterType !== "all" && asset.file_type !== filterType) {
        return false;
      }
      if (!q) return true;
      return (
        asset.file_name.toLowerCase().includes(q) ||
        asset.rel_path.toLowerCase().includes(q)
      );
    });
  }, [assets, query, filterType]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredAssets.length > 0 ? (prev + 1) % filteredAssets.length : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredAssets.length > 0
            ? (prev - 1 + filteredAssets.length) % filteredAssets.length
            : 0,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredAssets[selectedIndex]) {
          onSelect(filteredAssets[selectedIndex]);
          onClose();
        }
      }
    },
    [filteredAssets, selectedIndex, onSelect, onClose],
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        overlayClassName="bg-black/50 backdrop-blur-xs"
        showCloseButton={false}
        aria-label="Pick asset"
        className="flex w-full max-h-[70vh] flex-col overflow-hidden rounded-xl border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)] p-0 shadow-2xl sm:max-w-lg"
      >
        <div className="flex items-center px-4 py-3 border-b border-[var(--sat-layout-border)] gap-2">
          <IconSearch
            size={18}
            className="text-[var(--sat-text-muted)] shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-[var(--sat-text-primary)] placeholder-[var(--sat-text-muted)] outline-none text-sm"
            placeholder="Search media or asset in vault..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <IconX size={16} />
          </Button>
        </div>

        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]/40 text-xs select-none">
          {FILTER_TYPES.map((ft) => (
            <Button
              key={ft}
              type="button"
              variant={filterType === ft ? "sat-primary" : "ghost"}
              size="sm"
              onClick={() => {
                setFilterType(ft);
                setSelectedIndex(0);
              }}
              aria-pressed={filterType === ft}
              className={`h-6 px-2 py-0.5 rounded text-xs capitalize ${
                filterType !== ft
                  ? "text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
                  : ""
              }`}
            >
              {ft === "all" ? "All" : ft}
            </Button>
          ))}
          <span className="ml-auto text-[11px] text-[var(--sat-text-muted)]">
            {filteredAssets.length} item{filteredAssets.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto max-h-80 p-1 divide-y divide-[var(--sat-layout-border)]/30">
          {filteredAssets.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--sat-text-muted)]">
              No media found in vault matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredAssets.map((asset, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <Button
                  key={asset.abs_path}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onSelect(asset);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors rounded h-auto ${
                    isSelected
                      ? "bg-accent text-accent-foreground *:[svg]:text-accent-foreground"
                      : "text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-2)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="shrink-0 opacity-80">
                      {asset.file_type === "image" ? (
                        <IconPhoto size={16} />
                      ) : asset.file_type === "video" ? (
                        <IconVideo size={16} />
                      ) : asset.file_type === "audio" ? (
                        <IconVolume size={16} />
                      ) : (
                        <IconFileCode size={16} />
                      )}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium truncate">
                        {asset.file_name}
                      </span>
                      <span
                        className={`text-[10px] truncate ${
                          isSelected
                            ? "text-accent-foreground/70"
                            : "text-[var(--sat-text-muted)]"
                        }`}
                      >
                        {asset.rel_path}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] shrink-0 ml-2 ${
                      isSelected
                        ? "text-accent-foreground/70"
                        : "text-[var(--sat-text-muted)]"
                    }`}
                  >
                    {formatFileSize(asset.size_bytes)}
                  </span>
                </Button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
