import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IndexingCompletePayload,
  IndexingProgressPayload,
} from "../types";

export interface UseIndexingProgressReturn {
  isIndexing: boolean;
  total: number;
  indexed: number;
  percentage: number;
  isComplete: boolean;
  dismiss: () => void;
}

/**
 * Listens to background vault indexing events emitted by the Rust backend.
 *
 * Exposes live progress (total notes, indexed count, percentage) to drive
 * the non-blocking Obsidian-parity progress toast.
 */
export function useIndexingProgress(): UseIndexingProgressReturn {
  const [isIndexing, setIsIndexing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [total, setTotal] = useState(0);
  const [indexed, setIndexed] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setIsIndexing(false);
    setIsComplete(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const unlistenProgressPromise = listen<IndexingProgressPayload>(
      "vault://indexing-progress",
      (event) => {
        if (!mounted) return;
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
        const p = event.payload;
        if (p.total > 0) {
          setIsIndexing(true);
          setIsComplete(false);
          setTotal(p.total);
          setIndexed(p.indexed);
          setPercentage(p.percentage);
        }
      },
    );

    const unlistenCompletePromise = listen<IndexingCompletePayload>(
      "vault://indexing-complete",
      (event) => {
        if (!mounted) return;
        setIsComplete(true);
        setPercentage(100);
        setIndexed(event.payload.total);

        // Auto-dismiss after 1.5s once indexing reaches 100%
        dismissTimerRef.current = setTimeout(() => {
          if (mounted) {
            setIsIndexing(false);
            setIsComplete(false);
          }
        }, 1500);
      },
    );

    return () => {
      mounted = false;
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      unlistenProgressPromise.then((unlisten) => unlisten()).catch(() => {});
      unlistenCompletePromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  return {
    isIndexing,
    total,
    indexed,
    percentage,
    isComplete,
    dismiss,
  };
}
