import { useEffect } from "react";

export interface UseCanvasKeyboardOptions {
  saveCanvasNow: () => void;
}

export function useCanvasKeyboard({ saveCanvasNow }: UseCanvasKeyboardOptions) {
  // Handle Ctrl+S / Cmd+S and global save actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        saveCanvasNow();
      }
    };
    const handleCustomSave = () => {
      saveCanvasNow();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("basalt:save-active", handleCustomSave);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("basalt:save-active", handleCustomSave);
    };
  }, [saveCanvasNow]);
}