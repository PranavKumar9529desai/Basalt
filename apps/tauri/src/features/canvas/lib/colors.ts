export const OBSIDIAN_CANVAS_COLORS: Record<
  string,
  { label: string; var: string; fallback: string }
> = {
  "1": {
    label: "Red",
    var: "var(--sat-accent-red, #ef4444)",
    fallback: "#ef4444",
  },
  "2": {
    label: "Orange",
    var: "var(--sat-accent-orange, #f97316)",
    fallback: "#f97316",
  },
  "3": {
    label: "Yellow",
    var: "var(--sat-accent-yellow, #eab308)",
    fallback: "#eab308",
  },
  "4": {
    label: "Green",
    var: "var(--sat-accent-green, #22c55e)",
    fallback: "#22c55e",
  },
  "5": {
    label: "Cyan",
    var: "var(--sat-accent-cyan, #06b6d4)",
    fallback: "#06b6d4",
  },
  "6": {
    label: "Purple",
    var: "var(--sat-accent-purple, #a855f7)",
    fallback: "#a855f7",
  },
};

export function resolveCanvasColor(
  color?: string,
  fallback = "var(--sat-layout-border)",
): string {
  if (!color) return fallback;
  if (
    color.startsWith("#") ||
    color.startsWith("var") ||
    color.startsWith("rgb")
  ) {
    return color;
  }
  const preset = OBSIDIAN_CANVAS_COLORS[color];
  return preset ? preset.var : fallback;
}
