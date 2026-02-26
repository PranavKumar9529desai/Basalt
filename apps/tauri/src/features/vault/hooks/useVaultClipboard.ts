import { useCallback, useMemo, useState } from "react";

export interface VaultClipboardItem {
  path: string;
  isFolder: boolean;
}

export interface VaultClipboardState {
  operation: "cut" | null;
  items: VaultClipboardItem[];
  timestamp: number | null;
}

export interface UseVaultClipboardReturn {
  clipboard: VaultClipboardState;
  hasItems: boolean;
  setCutItems: (items: VaultClipboardItem[]) => void;
  clearClipboard: () => void;
  isCutPath: (path: string) => boolean;
}

export function useVaultClipboard(): UseVaultClipboardReturn {
  const [clipboard, setClipboard] = useState<VaultClipboardState>({
    operation: null,
    items: [],
    timestamp: null,
  });

  const hasItems = clipboard.operation === "cut" && clipboard.items.length > 0;

  const setCutItems = useCallback((items: VaultClipboardItem[]) => {
    setClipboard({
      operation: "cut",
      items,
      timestamp: Date.now(),
    });
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard({
      operation: null,
      items: [],
      timestamp: null,
    });
  }, []);

  const cutPaths = useMemo(
    () => new Set(clipboard.items.map((item) => item.path)),
    [clipboard.items],
  );

  const isCutPath = useCallback(
    (path: string) => cutPaths.has(path),
    [cutPaths],
  );

  return {
    clipboard,
    hasItems,
    setCutItems,
    clearClipboard,
    isCutPath,
  };
}
