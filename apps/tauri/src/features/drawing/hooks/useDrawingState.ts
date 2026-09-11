import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLeafServices, type LeafServices } from "@workspace/views";
import type {
  DrawingPayload,
  DrawingViewMode,
  ExcalidrawAppStateStub,
  ExcalidrawElementStub,
  ExcalidrawSceneData,
} from "../types";
import { CANVAS_BG, makeEmptySceneJson } from "../lib/scene";

export interface UseDrawingStateOptions {
  tab: { id: string; path: string };
}

interface SceneState {
  elements: readonly ExcalidrawElementStub[];
  appState: Partial<ExcalidrawAppStateStub>;
  files: Record<string, unknown>;
}

const EMPTY_SCENE: SceneState = {
  elements: [],
  appState: {},
  files: {},
};

export function useDrawingState({ tab }: UseDrawingStateOptions) {
  let services: LeafServices | null = null;
  try {
    services = useLeafServices();
  } catch {
    // Tolerated for isolated unit tests without LeafServicesProvider
  }
  const servicesRef = useRef(services);
  servicesRef.current = services;

  const [isLoaded, setIsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<DrawingViewMode>("canvas");
  const [initialData, setInitialData] =
    useState<Partial<ExcalidrawSceneData> | null>(null);
  const [rawMarkdown, setRawMarkdownState] = useState("");

  const sceneDataRef = useRef<SceneState>(EMPTY_SCENE);
  const isLoadedRef = useRef(false);
  const isDirtyRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Load drawing on mount or path change. */
  useEffect(() => {
    let isCancelled = false;
    isLoadedRef.current = false;
    setIsLoaded(false);

    async function load() {
      const fallback = (): Partial<ExcalidrawSceneData> => {
        let empty: Partial<ExcalidrawSceneData>;
        try {
          empty = JSON.parse(makeEmptySceneJson());
        } catch {
          empty = EMPTY_SCENE;
        }
        sceneDataRef.current = {
          elements: (empty.elements || []).filter((e) => !e.isDeleted),
          appState: empty.appState || {},
          files: empty.files || {},
        };
        return sceneDataRef.current;
      };

      try {
        const payload = await invoke<DrawingPayload>("read_drawing", {
          path: tab.path,
        });
        if (isCancelled) return;

        let scene: Partial<ExcalidrawSceneData>;
        try {
          scene = JSON.parse(payload.data_json);
        } catch {
          scene = fallback();
        }

        sceneDataRef.current = {
          elements: (scene.elements || []).filter((e) => !e.isDeleted),
          appState: {
            ...scene.appState,
            viewBackgroundColor: CANVAS_BG,
          },
          files: scene.files || {},
        };
        setInitialData(sceneDataRef.current);
        setRawMarkdownState(payload.raw_markdown);
        isLoadedRef.current = true;
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load drawing:", err);
        if (isCancelled) return;
        fallback();
        setInitialData(sceneDataRef.current);
        setRawMarkdownState("");
        isLoadedRef.current = true;
        setIsLoaded(true);
      }
    }

    void load();

    return () => {
      isCancelled = true;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [tab.path]);

  /** Build the scene JSON payload for save/serialize calls. */
  const buildSceneJson = useCallback((): string => {
    const cleanElements = sceneDataRef.current.elements.filter(
      (e) => !e.isDeleted,
    );
    return JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "basalt",
      elements: cleanElements,
      appState: {
        viewBackgroundColor: CANVAS_BG,
        gridSize: sceneDataRef.current.appState.gridSize ?? 20,
      },
      files: sceneDataRef.current.files,
    });
  }, []);

  /** Save current drawing immediately. */
  const saveNow = useCallback(async () => {
    if (!isLoadedRef.current) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      await invoke("save_drawing", {
        path: tab.path,
        dataJson: viewMode === "raw" ? "" : buildSceneJson(),
        rawMarkdown: viewMode === "raw" ? rawMarkdown : null,
      });

      isDirtyRef.current = false;
      servicesRef.current?.markTabDirty(tab.id, false);
    } catch (err) {
      console.error("Failed to save drawing:", err);
    }
  }, [tab.path, tab.id, viewMode, rawMarkdown, buildSceneJson]);

  /** Debounced auto-save (400ms trailing). */
  const scheduleSave = useCallback(() => {
    if (!isLoadedRef.current) return;
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      servicesRef.current?.markTabDirty(tab.id, true);
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void saveNow();
    }, 400);
  }, [saveNow, tab.id]);

  /** Handle scene mutation from Excalidraw onChange. */
  const onSceneChange = useCallback(
    (
      elements: readonly ExcalidrawElementStub[],
      appState: Partial<ExcalidrawAppStateStub>,
      files?: Record<string, unknown>,
    ) => {
      if (!isLoadedRef.current) return;
      sceneDataRef.current = {
        elements,
        appState,
        files: files || sceneDataRef.current.files,
      };
      scheduleSave();
    },
    [scheduleSave],
  );

  /** Handle raw markdown edits. */
  const setRawMarkdown = useCallback(
    (newMarkdown: string) => {
      setRawMarkdownState(newMarkdown);
      scheduleSave();
    },
    [scheduleSave],
  );

  /** Toggle between Canvas mode and Raw Markdown mode. */
  const toggleViewMode = useCallback(async () => {
    if (viewMode === "canvas") {
      // Canvas → raw: ask Rust to serialize the scene into the hybrid format.
      try {
        const generated = await invoke<string>("serialize_drawing", {
          dataJson: buildSceneJson(),
          existingMarkdown: rawMarkdown,
        });
        setRawMarkdownState(generated);
        setViewMode("raw");
      } catch (err) {
        console.error("Failed to serialize drawing markdown:", err);
      }
    } else {
      // Raw → canvas: ask Rust to parse the markdown back into a scene.
      try {
        const parsed = await invoke<DrawingPayload>("parse_drawing", {
          content: rawMarkdown,
        });
        const scene = JSON.parse(
          parsed.data_json,
        ) as Partial<ExcalidrawSceneData>;
        const elements = (scene.elements || []).filter((e) => !e.isDeleted);
        sceneDataRef.current = {
          elements,
          appState: scene.appState || {},
          files: scene.files || {},
        };
        setInitialData(sceneDataRef.current);
        setViewMode("canvas");
      } catch (err) {
        console.error("Failed to parse drawing data from raw markdown:", err);
      }
    }
  }, [viewMode, rawMarkdown, buildSceneJson]);

  return {
    isLoaded,
    viewMode,
    initialData,
    rawMarkdown,
    sceneDataRef,
    onSceneChange,
    setRawMarkdown,
    saveNow,
    toggleViewMode,
  };
}
