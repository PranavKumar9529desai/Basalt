import { useEffect, useState } from "react";

export interface DrawingThemeInfo {
  /** "light" | "dark" passed to <Excalidraw theme> prop */
  theme: "light" | "dark";
  /** Scoped CSS text to inject into a <style> tag inside the Excalidraw wrapper */
  cssOverride: string;
}

/** Read a CSS custom property from the document root. */
function getCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Mix two hex colours by `amount` (0 = all src, 1 = all target).
 * Handles #rrggbb and #rgb notation.
 */
function mixHex(src: string, target: string, amount: number): string {
  const parse = (h: string): [number, number, number] => {
    const x = h.replace("#", "");
    if (x.length === 3) {
      return [
        parseInt(x[0] + x[0], 16),
        parseInt(x[1] + x[1], 16),
        parseInt(x[2] + x[2], 16),
      ];
    }
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
  };
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const [r1, g1, b1] = parse(src);
  const [r2, g2, b2] = parse(target);
  return `rgb(${clamp(r1 + (r2 - r1) * amount)},${clamp(g1 + (g2 - g1) * amount)},${clamp(b1 + (b2 - b1) * amount)})`;
}

function buildThemeInfo(): DrawingThemeInfo {
  const isServer = typeof document === "undefined";
  const themeAttr = isServer ? "" : (document.documentElement.dataset.theme ?? "");

  // Determine light vs dark from the data-theme attribute
  const lightThemes = ["light", "latte", "solarized-light"];
  const isLight = lightThemes.some((t) => themeAttr.includes(t)) ||
    (!themeAttr &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);

  const theme: "light" | "dark" = isLight ? "light" : "dark";

  // --- Read every relevant Basalt design token ---
  const accent    = getCssVar("--sat-accent-primary", isLight ? "#2563eb" : "#ff6a00");
  const surface1  = getCssVar("--sat-surface-1",      isLight ? "#f8fafc"  : "#0d0e12");
  const surface2  = getCssVar("--sat-surface-2",      isLight ? "#eef2f6"  : "#14151a");
  const surface3  = getCssVar("--sat-surface-3",      isLight ? "#e2e8f0"  : "#1c1e26");
  const textPrimary = getCssVar("--sat-text-primary", isLight ? "#0f172a"  : "#f2f4f8");
  const textMuted   = getCssVar("--sat-text-muted",   isLight ? "#475569"  : "#8a8f9e");
  const border      = getCssVar("--sat-layout-border", isLight ? "#cbd5e1" : "#232530");

  const white = "#ffffff";
  const black = "#000000";

  // Derive accent shades
  const accentDarker      = mixHex(accent, black, 0.12);
  const accentDarkest     = mixHex(accent, black, 0.25);
  const accentHover       = mixHex(accent, white, 0.10);
  const accentLight       = isLight ? mixHex(accent, white, 0.85) : mixHex(accent, black, 0.60);
  const accentLightDarker = isLight ? mixHex(accent, white, 0.75) : mixHex(accent, black, 0.50);

  const overlayBg = isLight ? "rgba(15,23,42,0.12)" : "rgba(0,0,0,0.35)";

  // Generate the CSS override block scoped to our wrapper class.
  // Excalidraw reads its own --color-* and --island-bg-color etc from the .excalidraw
  // selector, so we must inject overrides on a parent that contains .excalidraw.
  const cssOverride = `
.excalidraw-basalt-host .excalidraw,
.excalidraw-basalt-host .excalidraw.theme--dark,
.excalidraw-basalt-host .excalidraw.theme--light {
  /* Accent / primary color — maps to sat-accent-primary */
  --color-primary: ${accent};
  --color-primary-darker: ${accentDarker};
  --color-primary-darkest: ${accentDarkest};
  --color-primary-hover: ${accentHover};
  --color-primary-light: ${accentLight};
  --color-primary-light-darker: ${accentLightDarker};
  --color-selection: ${accent};
  --color-brand-hover: ${accentHover};
  --color-brand-active: ${accentDarker};
  --color-on-primary-container: ${textPrimary};
  --color-surface-primary-container: ${accentLight};

  /* Surface / background hierarchy */
  --default-bg-color: ${surface1};
  --island-bg-color: ${surface2};
  --popup-bg-color: ${surface2};
  --popup-secondary-bg-color: ${surface3};
  --popup-text-color: ${textPrimary};
  --popup-text-inverted-color: ${surface3};

  /* Inputs */
  --input-bg-color: ${surface1};
  --input-border-color: ${border};
  --input-hover-bg-color: ${surface2};
  --input-label-color: ${textPrimary};

  /* Buttons */
  --button-gray-1: ${surface3};
  --button-gray-2: ${surface2};
  --button-gray-3: ${surface1};
  --button-hover-bg: ${surface3};
  --button-active-bg: ${surface3};
  --default-border-color: ${border};
  --dialog-border-color: ${border};

  /* Typography / icons */
  --text-primary-color: ${textPrimary};
  --color-on-surface: ${textPrimary};
  --color-muted: ${textMuted};
  --keybinding-color: ${textMuted};

  /* Surfaces used for surface system */
  --color-surface-high: ${surface3};
  --color-surface-mid: ${surface2};
  --color-surface-low: ${surface1};
  --color-surface-lowest: ${surface1};

  /* Sidebar */
  --sidebar-border-color: ${border};
  --sidebar-bg-color: ${surface2};

  /* Misc */
  --focus-highlight-color: ${accent};
  --link-color: ${accent};
  --overlay-bg-color: ${overlayBg};
  --scrollbar-thumb: ${surface3};
  --scrollbar-thumb-hover: ${mixHex(surface3, isLight ? black : white, 0.1)};
}

/* ---- Canvas background override ----
   Excalidraw sets the canvas background via inline JS style (viewBackgroundColor).
   Our --default-bg-color override has equal specificity to Excalidraw's own
   .excalidraw.theme--dark rule.  Because Excalidraw's stylesheet loads after our
   injected <style> tag, theirs wins in same-specificity cascade.

   We fix this with !important on --default-bg-color (escalates above competing
   rules) and by painting the canvas wrapper directly so even if
   viewBackgroundColor is stale the visual result is correct.
*/
.excalidraw-basalt-host .excalidraw {
  --default-bg-color: ${surface1} !important;
}
.excalidraw-basalt-host .excalidraw .excalidraw__canvas-wrapper,
.excalidraw-basalt-host .excalidraw canvas.excalidraw__canvas {
  background-color: ${surface1} !important;
}

/* Hide Excalidraw's built-in top-right UI buttons (Library, Help) that overlap
   our DrawingHeaderActions vertical strip. We replace them with our own panel. */
.excalidraw-basalt-host .excalidraw .library-button,
.excalidraw-basalt-host .excalidraw [aria-label="Open menu"],
.excalidraw-basalt-host .excalidraw .help-icon,
.excalidraw-basalt-host .excalidraw .sidebar-trigger,
.excalidraw-basalt-host .excalidraw .App-toolbar__divider + button:last-child {
  display: none !important;
}`.trim();

  return { theme, cssOverride };
}

/**
 * Bridges Basalt's `--sat-*` design tokens to Excalidraw's own CSS variable
 * namespace, so that every Basalt theme (volcanic, dracula, catppuccin,
 * light, solarized-dark…) is automatically reflected in the Excalidraw canvas.
 *
 * Returns the excalidraw theme string ("light"|"dark") and a `cssOverride`
 * string that must be injected as a `<style>` tag inside
 * `.excalidraw-basalt-host` (the wrapper div around `<Excalidraw>`).
 */
export function useExcalidrawTheme(): DrawingThemeInfo {
  const [info, setInfo] = useState<DrawingThemeInfo>(() => buildThemeInfo());

  useEffect(() => {
    const update = () => setInfo(buildThemeInfo());
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return info;
}

