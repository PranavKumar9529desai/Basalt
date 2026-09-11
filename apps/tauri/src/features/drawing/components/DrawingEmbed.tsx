import { memo, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLeafServices, type LeafServices } from "@workspace/views";
import { exportSceneToSvg } from "../lib/export";
import type { DrawingPayload, ExcalidrawSceneData } from "../types";

export interface DrawingEmbedProps {
  path: string;
  frame?: string;
  className?: string;
}

/**
 * Lightweight SVG preview for drawing embeds (![[Diagram.drawing.md]] or ![[Diagram.drawing.md#^frame=...]]).
 * Renders static/responsive vector SVG without mounting the full Excalidraw editor instance (ADR-047 §7).
 */
export const DrawingEmbed = memo(function DrawingEmbed({
  path,
  frame,
  className,
}: DrawingEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  let services: LeafServices | null = null;
  try {
    services = useLeafServices();
  } catch {
    // Tolerated if rendered outside LeafServicesProvider
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function renderSvg() {
      try {
        const payload = await invoke<DrawingPayload>("read_drawing", { path });
        if (cancelled) return;

        let scene: Partial<ExcalidrawSceneData> = {};
        try {
          scene = JSON.parse(payload.data_json);
        } catch {
          scene = { elements: [] };
        }

        let elements = (scene.elements || []).filter((e) => !e.isDeleted);
        if (frame) {
          elements = elements.filter(
            (el) => el.frameId === frame || el.id === frame || el.name === frame,
          );
        }

        const svg = await exportSceneToSvg(
          elements,
          scene.appState,
          scene.files,
        );
        if (cancelled) return;

        svg.style.width = "100%";
        svg.style.height = "auto";
        svg.style.maxHeight = "500px";
        svg.style.display = "block";

        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          containerRef.current.appendChild(svg);
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      }
    }

    void renderSvg();
    return () => {
      cancelled = true;
    };
  }, [path, frame]);

  const handleDoubleClick = () => {
    services?.openNote(path);
  };

  return (
    <div
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      className={`my-3 overflow-hidden rounded-lg border border-[var(--sat-layout-border,#27272a)] bg-[var(--sat-surface-1,#121110)] p-2 transition-shadow hover:shadow-md cursor-pointer ${
        className || ""
      }`}
      title="Double click to open drawing"
    >
      {loading && (
        <div className="flex h-32 items-center justify-center text-xs text-[var(--sat-text-muted,#71717a)]">
          Loading drawing preview…
        </div>
      )}
      {error && (
        <div className="flex h-16 items-center justify-center text-xs text-red-400">
          Failed to load drawing preview
        </div>
      )}
    </div>
  );
});
