import { memo, useEffect, useState, useMemo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { invoke } from "@tauri-apps/api/core";
import {
  IconFileText,
  IconExternalLink,
  IconPhoto,
  IconVideo,
  IconVolume,
  IconFileCode,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { classifyMediaExtension, extensionOf } from "@workspace/editor";
import { useLeafServices } from "@workspace/views";

import type { CanvasXYNode } from "../lib/mapper";
import { resolveCanvasColor } from "../lib/colors";
import { CardHandles } from "./CardHandles";
import { useCanvas } from "../lib/CanvasContext";
import { CanvasCardEditor } from "../components/CanvasCardEditor";
import { stemOf } from "@workspace/ui";

function FileNodeInner({ data, selected }: NodeProps<CanvasXYNode>) {
  const canvas = useCanvas();
  const filePath = (data.file as string) || "";
  const subpath = data.subpath as string | undefined;
  const color = data.color as string | undefined;
  const borderColor = resolveCanvasColor(color, "var(--sat-layout-border)");

  let services: ReturnType<typeof useLeafServices> | null = null;
  try {
    services = useLeafServices();
  } catch {
    // Leaf services may be omitted in isolated render tests
  }

  const ext = extensionOf(filePath);
  const mediaType = classifyMediaExtension(ext);
  const isMarkdown = ext === "md" || ext === "" || mediaType === "other";

  // Note content state
  const [noteContent, setNoteContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Resolved note absolute path
  const resolvedNote = useMemo(() => {
    if (!services || !isMarkdown) return null;
    return services.findNote(filePath);
  }, [services, filePath, isMarkdown]);

  // Load note text if it's markdown
  useEffect(() => {
    if (!isMarkdown || !filePath) return;

    let isMounted = true;
    const targetPath = resolvedNote?.path || filePath;

    invoke<string>("open_file", { path: targetPath })
      .then((content) => {
        if (isMounted) {
          setNoteContent(content);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLoadError(String(err));
          setNoteContent(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isMarkdown, filePath, resolvedNote]);

  // Resolved media URL (images, video, audio)
  const mediaUrl = useMemo(() => {
    if (isMarkdown || !services?.resolveAsset || !filePath) return null;
    return services.resolveAsset(filePath);
  }, [isMarkdown, services, filePath]);

  const handleOpenNote = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!services || !filePath) return;
    const abs = resolvedNote?.path || filePath;
    services.openNote(abs);
  };

  const fileName = stemOf(filePath) || filePath;

  return (
    <div className="group relative w-full h-full">
      <NodeResizer
        minWidth={160}
        minHeight={100}
        isVisible={selected}
        onResizeEnd={() => canvas.saveNow()}
      />
      <CardHandles borderColor={borderColor} selected={selected} />

      <div
        className="w-full h-full rounded-md border-2 bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] shadow-sm overflow-hidden flex flex-col"
        style={{ borderColor, contain: "layout style paint" }}
      >
        {/* Card Header for Notes or Media */}
        <div
          className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]/60 cursor-grab active:cursor-grabbing select-none"
          onDoubleClick={handleOpenNote}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isMarkdown ? (
              <IconFileText
                size={15}
                className="text-[var(--sat-accent-primary)] shrink-0"
              />
            ) : mediaType === "image" ? (
              <IconPhoto
                size={15}
                className="text-[var(--sat-accent-green)] shrink-0"
              />
            ) : mediaType === "video" ? (
              <IconVideo
                size={15}
                className="text-[var(--sat-accent-orange)] shrink-0"
              />
            ) : mediaType === "audio" ? (
              <IconVolume
                size={15}
                className="text-[var(--sat-accent-purple)] shrink-0"
              />
            ) : (
              <IconFileCode
                size={15}
                className="text-[var(--sat-text-muted)] shrink-0"
              />
            )}
            <span
              className="text-xs font-semibold truncate text-[var(--sat-text-primary)]"
              title={filePath}
            >
              {fileName}
            </span>
            {subpath && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--sat-surface-3)] text-[var(--sat-text-muted)] shrink-0">
                {subpath}
              </span>
            )}
          </div>

          {isMarkdown && (
            <button
              type="button"
              onClick={handleOpenNote}
              className="p-1 rounded text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] transition-colors shrink-0"
              title="Open note in tab"
            >
              <IconExternalLink size={13} />
            </button>
          )}
        </div>

        {/* Card Body */}
        <div
          className={`flex-1 overflow-auto w-full h-full flex flex-col ${isMarkdown ? "p-0" : "p-3"}`}
        >
          {isMarkdown ? (
            loadError ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-xs text-[var(--sat-text-muted)] p-2">
                <IconAlertTriangle
                  size={20}
                  className="text-[var(--sat-accent-yellow)] mb-1"
                />
                <span>Could not load note</span>
                <span className="text-[10px] opacity-70 truncate max-w-full mt-0.5">
                  {filePath}
                </span>
              </div>
            ) : noteContent === null ? (
              <div className="flex items-center justify-center h-full text-xs text-[var(--sat-text-muted)]">
                Loading...
              </div>
            ) : (
              <div className="flex-1 w-full h-full min-h-0 overflow-hidden">
                <CanvasCardEditor text={noteContent} isEditing={false} />
              </div>
            )
          ) : mediaUrl ? (
            mediaType === "image" ? (
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img
                  src={mediaUrl}
                  alt={fileName}
                  className="w-full h-full object-contain rounded select-none pointer-events-none"
                  loading="lazy"
                />
              </div>
            ) : mediaType === "video" ? (
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <video
                  src={mediaUrl}
                  controls
                  className="w-full h-full object-contain rounded"
                >
                  <track kind="captions" />
                </video>
              </div>
            ) : mediaType === "audio" ? (
              <div className="flex-1 flex flex-col items-center justify-center p-2">
                <audio src={mediaUrl} controls className="w-full">
                  <track kind="captions" />
                </audio>
              </div>
            ) : mediaType === "pdf" ? (
              <iframe
                src={mediaUrl}
                className="w-full h-full rounded border-0"
                title={fileName}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-xs text-[var(--sat-text-muted)]">
                <IconFileCode size={24} className="mb-1" />
                <span>{fileName}</span>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-xs text-[var(--sat-text-muted)] p-2">
              <IconPhoto size={24} className="mb-1 opacity-50" />
              <span>{fileName}</span>
              <span className="text-[10px] opacity-70">
                Media preview unavailable
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const FileNode = memo(FileNodeInner);
