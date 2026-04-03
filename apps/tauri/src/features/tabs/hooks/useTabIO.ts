import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef } from "react";

interface CachedTabContent {
  content: string;
  mtimeMs: number | null;
  lastAccessedAt: number;
}

interface OpenFileResult {
  path: string;
  content: string;
  mtimeMs: number | null;
}

interface SaveFileInput {
  path: string;
  content: string;
  expectedMtimeMs?: number | null;
}

interface UseTabIOOptions {
  maxCacheEntries?: number;
}

function normalizeError(error: unknown) {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : String(error);
}

export function useTabIO({ maxCacheEntries = 32 }: UseTabIOOptions = {}) {
  const cacheRef = useRef<Map<string, CachedTabContent>>(new Map());

  const touchCache = useCallback(
    (path: string, entry: CachedTabContent) => {
      const cache = cacheRef.current;
      cache.delete(path);
      cache.set(path, {
        ...entry,
        lastAccessedAt: Date.now(),
      });

      while (cache.size > maxCacheEntries) {
        const oldest = cache.keys().next().value;
        if (!oldest) break;
        cache.delete(oldest);
      }
    },
    [maxCacheEntries],
  );

  const loadTabContent = useCallback(
    async (path: string, forceReload = false): Promise<CachedTabContent> => {
      if (!forceReload) {
        const cached = cacheRef.current.get(path);
        if (cached) {
          touchCache(path, cached);
          return cached;
        }
      }

      const content = await invoke<string>("open_file", { path });
      const next: CachedTabContent = {
        content,
        mtimeMs: null,
        lastAccessedAt: Date.now(),
      };
      touchCache(path, next);
      return next;
    },
    [touchCache],
  );

  const loadManyTabContents = useCallback(
    async (paths: string[]): Promise<Record<string, CachedTabContent>> => {
      if (paths.length === 0) return {};

      try {
        const batched = await invoke<OpenFileResult[]>("open_files", { paths });
        const output: Record<string, CachedTabContent> = {};
        for (const file of batched) {
          const entry: CachedTabContent = {
            content: file.content,
            mtimeMs: file.mtimeMs ?? null,
            lastAccessedAt: Date.now(),
          };
          output[file.path] = entry;
          touchCache(file.path, entry);
        }
        return output;
      } catch {
        const output: Record<string, CachedTabContent> = {};
        await Promise.all(
          paths.map(async (path) => {
            const file = await loadTabContent(path, true);
            output[path] = file;
          }),
        );
        return output;
      }
    },
    [loadTabContent, touchCache],
  );

  const saveTabContent = useCallback(
    async ({ path, content, expectedMtimeMs }: SaveFileInput) => {
      try {
        await invoke("save_files", {
          files: [{ path, content, expectedMtimeMs }],
        });
      } catch {
        await invoke("save_file", { path, content });
      }

      touchCache(path, {
        content,
        mtimeMs: expectedMtimeMs ?? null,
        lastAccessedAt: Date.now(),
      });
    },
    [touchCache],
  );

  const invalidateTab = useCallback((path: string) => {
    cacheRef.current.delete(path);
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    loadTabContent,
    loadManyTabContents,
    saveTabContent,
    invalidateTab,
    clearCache,
    getCached: (path: string) => cacheRef.current.get(path) ?? null,
    getCacheSize: () => cacheRef.current.size,
    normalizeError,
  };
}

export type {
  CachedTabContent,
  OpenFileResult,
  SaveFileInput,
  UseTabIOOptions,
};
