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
import {
  parseDrawingContent,
  serializeDrawingMarkdown,
  getEditorBg,
  makeEmptyDrawingJson,
} from "../lib/parser";

export interface UseDrawingStateOptions {
  tab: { id: string; path: string };
}

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
  const [initialData, setInitialData] = useState<Partial<ExcalidrawSceneData> | null>(null);
  const [rawMarkdown, setRawMarkdownState] = useState("");

  const sceneDataRef = useRef<{
    elements: readonly ExcalidrawElementStub[];
    appState: Partial<ExcalidrawAppStateStub>;
    files: Record<string, unknown>;
  }>({
    elements: [],
    appState: {},
    files: {},
  });

  const isLoadedRef = useRef(false);
  const isDirtyRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load drawing on mount or path change
  useEffect(() => {
    let isCancelled = false;
    isLoadedRef.current = false;
    setIsLoaded(false);

    async function load() {
      try {
        const payload = await invoke<DrawingPayload>("read_drawing", {
          path: tab.path,
        });
        if (isCancelled) return;

        let parsedScene: Partial<ExcalidrawSceneData> = {};
        try {
          parsedScene = JSON.parse(payload.data_json);
        } catch {
          parsedScene = JSON.parse(makeEmptyDrawingJson());
        }

        // Default to the current editor background so the canvas feels like a
        // native continuation of the editor surface. Also migrate old drawings
        // that still have the Excalidraw default white (#ffffff).
        const storedBg = parsedScene.appState?.viewBackgroundColor;
        const editorBg = getEditorBg();
        const resolvedBg =
          storedBg && storedBg !== "#ffffff" ? storedBg : editorBg;

        sceneDataRef.current = {
          elements: (parsedScene.elements || []).filter((e) => !e.isDeleted),
          appState: {
            ...parsedScene.appState,
            viewBackgroundColor: resolvedBg,
          },
          files: parsedScene.files || {},
        };

        setInitialData({
          elements: sceneDataRef.current.elements,
          appState: sceneDataRef.current.appState,
          files: sceneDataRef.current.files,
        });
        setRawMarkdownState(payload.raw_markdown);
        isLoadedRef.current = true;
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load drawing:", err);
        if (isCancelled) return;
        const empty = JSON.parse(makeEmptyDrawingJson());
        sceneDataRef.current = {
          elements: [],
          appState: empty.appState,
          files: {},
        };
        setInitialData(empty);
        setRawMarkdownState(serializeDrawingMarkdown(makeEmptyDrawingJson()));
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

  // Save current drawing immediately
  const saveNow = useCallback(async () => {
    if (!isLoadedRef.current) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      if (viewMode === "raw") {
        await invoke("save_drawing", {
          path: tab.path,
          dataJson: "",
          rawMarkdown,
        });
      } else {
        const cleanElements = sceneDataRef.current.elements.filter(
          (e) => !e.isDeleted,
        );
        const dataJson = JSON.stringify({
          type: "excalidraw",
          version: 2,
          source: "basalt",
          elements: cleanElements,
          appState: {
            // Migrate old drawings that still have Excalidraw's default white.
            viewBackgroundColor:
              sceneDataRef.current.appState.viewBackgroundColor !== "#ffffff"
                ? sceneDataRef.current.appState.viewBackgroundColor || getEditorBg()
                : getEditorBg(),
            gridSize: sceneDataRef.current.appState.gridSize ?? 20,
          },
          files: sceneDataRef.current.files,
        });

        await invoke("save_drawing", {
          path: tab.path,
          dataJson,
          rawMarkdown: null,
        });
      }

      isDirtyRef.current = false;
      servicesRef.current?.markTabDirty(tab.id, false);
    } catch (err) {
      console.error("Failed to save drawing:", err);
    }
  }, [tab.path, tab.id, viewMode, rawMarkdown]);

  // Debounced auto-save (400ms trailing)
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

  // Handle scene mutation from Excalidraw onChange
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

  // Handle raw markdown edits
  const setRawMarkdown = useCallback(
    (newMarkdown: string) => {
      setRawMarkdownState(newMarkdown);
      scheduleSave();
    },
    [scheduleSave],
  );

  // Toggle between Canvas mode and Raw Markdown mode
  const toggleViewMode = useCallback(() => {
    if (viewMode === "canvas") {
      // Transitioning to raw markdown: serialize current scene to markdown
      const cleanElements = sceneDataRef.current.elements.filter(
        (e) => !e.isDeleted,
      );
      const dataJson = JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "basalt",
        elements: cleanElements,
        appState: {
          viewBackgroundColor:
            sceneDataRef.current.appState.viewBackgroundColor !== "#ffffff"
              ? sceneDataRef.current.appState.viewBackgroundColor || getEditorBg()
              : getEditorBg(),
          gridSize: sceneDataRef.current.appState.gridSize ?? 20,
        },
        files: sceneDataRef.current.files,
      });
      const generated = serializeDrawingMarkdown(dataJson, rawMarkdown);
      setRawMarkdownState(generated);
      setViewMode("raw");
    } else {
      // Transitioning to canvas: parse current raw markdown into scene data
      const parsed = parseDrawingContent(rawMarkdown);
      try {
        const scene = JSON.parse(parsed.data_json) as Partial<ExcalidrawSceneData>;
        const elements = (scene.elements || []).filter((e) => !e.isDeleted);
        sceneDataRef.current = {
          elements,
          appState: scene.appState || {},
          files: scene.files || {},
        };
        setInitialData({
          elements,
          appState: sceneDataRef.current.appState,
          files: sceneDataRef.current.files,
        });
      } catch (err) {
        console.error("Failed to parse drawing data from raw markdown:", err);
      }
      setViewMode("canvas");
    }
  }, [viewMode, rawMarkdown]);

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
