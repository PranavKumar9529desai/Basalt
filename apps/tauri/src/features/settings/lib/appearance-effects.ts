import { useEffect } from "react";
import { useSetting } from "./settings-data";

/**
 * AppearanceEffects — applies Appearance settings to the live UI
 * (ADR-037 §7.B / spec §5.2): accent color, font family, base font
 * size, and interface zoom.
 *
 * Mounted once in `main.tsx`. All writes target CSS custom properties
 * and inline styles on `<html>`; default values are no-ops, so the
 * current look is untouched until the user changes a setting.
 */

/** Darken/lighten a `#rrggbb` color by `percent` in (-100..100). */
function shade(hex: string, percent: number): string {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const n = parseInt(h, 16);
  const amt = Math.round((percent / 100) * 255);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + amt));
  const r = clamp((n >> 16) & 0xff);
  const g = clamp((n >> 8) & 0xff);
  const b = clamp(n & 0xff);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function AppearanceEffects() {
  const accentColor = useSetting("accentColor");
  const fontFamily = useSetting("fontFamily");
  const fontSize = useSetting("fontSize");
  const zoomLevel = useSetting("zoomLevel");

  // Accent override → primary token + derived hover shade. Empty (the
  // default) restores whatever the active theme defines.
  useEffect(() => {
    const style = document.documentElement.style;
    if (HEX_RE.test(accentColor)) {
      style.setProperty("--sat-accent-primary", accentColor);
      style.setProperty("--sat-accent-strong", shade(accentColor, -15));
    } else {
      style.removeProperty("--sat-accent-primary");
      style.removeProperty("--sat-accent-strong");
    }
  }, [accentColor]);

  // Interface font override; empty restores the theme's default.
  useEffect(() => {
    const style = document.documentElement.style;
    if (fontFamily.trim()) {
      style.setProperty("--sat-font-sans", fontFamily);
    } else {
      style.removeProperty("--sat-font-sans");
    }
  }, [fontFamily]);

  // Base font size: scale rem-based sizing proportionally around the
  // 14px default (root 16px today ⇔ fontSize 14 — so the default is
  // exactly the current look).
  useEffect(() => {
    document.documentElement.style.fontSize = `${(16 * fontSize) / 14}px`;
  }, [fontSize]);

  // Interface zoom: CSS `zoom` on <html> (supported by the Tauri webview).
  useEffect(() => {
    document.documentElement.style.setProperty("zoom", String(zoomLevel / 100));
  }, [zoomLevel]);

  return null;
}