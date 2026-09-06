import { createContext, useContext } from "react";

export interface CanvasContextValue {
  updateText: (id: string, text: string) => void;
  updateUrl: (id: string, url: string) => void;
  saveNow: () => void;
}

export const CanvasContext = createContext<CanvasContextValue | null>(null);

export function useCanvas(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) {
    throw new Error("useCanvas must be used within CanvasContext.Provider");
  }
  return ctx;
}
