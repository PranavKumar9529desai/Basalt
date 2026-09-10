import { useEffect, useState } from "react";

export interface DrawingThemeInfo {
  theme: "light" | "dark";
  viewBackgroundColor: string;
  canvasBg: string;
}

function resolveThemeInfo(): DrawingThemeInfo {
  if (typeof document === "undefined") {
    return {
      theme: "dark",
      viewBackgroundColor: "#121110",
      canvasBg: "#121110",
    };
  }

  const root = document.documentElement;
  const themeAttr = root.dataset.theme || "";
  const isLight =
    themeAttr.includes("light") ||
    root.classList.contains("light") ||
    (!themeAttr.includes("dark") &&
      window.matchMedia?.("(prefers-color-scheme: light)").matches);

  const style = window.getComputedStyle(root);
  const surface1 =
    style.getPropertyValue("--sat-surface-1").trim() || (isLight ? "#f8fafc" : "#121110");
  const canvasBg =
    style.getPropertyValue("--sat-canvas-bg").trim() || surface1;

  return {
    theme: isLight ? "light" : "dark",
    viewBackgroundColor: canvasBg,
    canvasBg,
  };
}

/**
 * Hook to bridge Basalt's `--sat-*` volcanic/active theme tokens to Excalidraw.
 * Observes changes to `document.documentElement[data-theme]` to dynamically update theme.
 */
export function useExcalidrawTheme(): DrawingThemeInfo {
  const [themeInfo, setThemeInfo] = useState<DrawingThemeInfo>(resolveThemeInfo);

  useEffect(() => {
    const update = () => setThemeInfo(resolveThemeInfo());
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });

    return () => observer.disconnect();
  }, []);

  return themeInfo;
}
