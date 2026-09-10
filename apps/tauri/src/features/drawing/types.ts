/**
 * TypeScript types for drawing domain (ADR-047).
 */

export interface DrawingPayload {
  data_json: string;
  text_elements: string[];
  raw_markdown: string;
  created?: string | null;
  updated?: string | null;
}

export interface CreateDrawingResult {
  path: string;
  name: string;
}

export interface ExcalidrawElementStub {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  isDeleted?: boolean;
  [key: string]: unknown;
}

export interface ExcalidrawAppStateStub {
  viewBackgroundColor?: string;
  theme?: "light" | "dark";
  gridSize?: number | null;
  zoom?: { value: number };
  scrollX?: number;
  scrollY?: number;
  [key: string]: unknown;
}

export interface ExcalidrawSceneData {
  type: "excalidraw";
  version: number;
  source?: string;
  elements: readonly ExcalidrawElementStub[];
  appState?: Partial<ExcalidrawAppStateStub>;
  files?: Record<string, unknown>;
}

export type DrawingViewMode = "canvas" | "raw";
