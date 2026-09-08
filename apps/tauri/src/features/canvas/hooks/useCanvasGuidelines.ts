import { useCallback, useState } from "react";

export interface GuidelinesState {
  vertical: number | null;
  horizontal: number | null;
  verticalLines?: number[];
  horizontalLines?: number[];
}

export function useCanvasGuidelines() {
  const [guidelines, setGuidelines] = useState<GuidelinesState>({
    vertical: null,
    horizontal: null,
    verticalLines: [],
    horizontalLines: [],
  });

  const clearGuidelines = useCallback(() => {
    setGuidelines({
      vertical: null,
      horizontal: null,
      verticalLines: [],
      horizontalLines: [],
    });
  }, []);

  return { guidelines, setGuidelines, clearGuidelines };
}