import { type Node, type Edge, MarkerType } from "@xyflow/react";
import type { CanvasDocument, CanvasNode, CanvasEdge, Side } from "../types";
import { resolveCanvasColor } from "./colors";

export type CanvasXYNode = Node<
  Record<string, any>,
  "canvasText" | "canvasFile" | "canvasLink" | "canvasGroup"
>;

export function mapToXYFlow(doc: CanvasDocument): {
  nodes: CanvasXYNode[];
  edges: Edge[];
} {
  const xyNodes: CanvasXYNode[] = (doc.nodes ?? []).map((node) => {
    const { id, x, y, width, height, color } = node;
    const baseNode: Partial<CanvasXYNode> = {
      id,
      position: { x, y },
      style: { width, height, zIndex: node.type === "group" ? -1 : 1 },
    };

    switch (node.type) {
      case "text":
        return {
          ...baseNode,
          type: "canvasText",
          data: { text: node.text, color },
        } as CanvasXYNode;
      case "file":
        return {
          ...baseNode,
          type: "canvasFile",
          data: { file: node.file, subpath: node.subpath, color },
        } as CanvasXYNode;
      case "link":
        return {
          ...baseNode,
          type: "canvasLink",
          data: { url: node.url, color },
        } as CanvasXYNode;
      case "group":
        return {
          ...baseNode,
          type: "canvasGroup",
          data: {
            label: node.label,
            background: node.background,
            backgroundStyle: node.backgroundStyle,
            color,
          },
        } as CanvasXYNode;
    }
  });

  const xyEdges: Edge[] = (doc.edges ?? []).map((edge) => {
    const toEnd = edge.toEnd ?? "arrow";
    const strokeColor = resolveCanvasColor(
      edge.color,
      "var(--sat-accent-primary, #6366f1)",
    );
    return {
      id: edge.id,
      source: edge.fromNode,
      sourceHandle: edge.fromSide ?? "right",
      target: edge.toNode,
      targetHandle: edge.toSide ?? "left",
      label: edge.label,
      type: "bezier",
      markerEnd:
        toEnd === "arrow"
          ? {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
            }
          : undefined,
      data: { color: edge.color },
      style: { stroke: strokeColor, strokeWidth: 2 },
    };
  });

  return { nodes: xyNodes, edges: xyEdges };
}

export function mapToCanvasDocument(
  nodes: CanvasXYNode[],
  edges: Edge[],
): CanvasDocument {
  const realNodes = nodes.filter(
    (n) => n.type !== ("canvasGhost" as any) && !n.id.startsWith("ghost-"),
  );
  const realEdges = edges.filter(
    (e) =>
      !e.id.startsWith("ghost-") &&
      realNodes.some((n) => n.id === e.source) &&
      realNodes.some((n) => n.id === e.target),
  );

  const canvasNodes: CanvasNode[] = realNodes.map((n) => {
    const { id, position, style, data } = n;
    const measured = (n as any).measured;
    const rawW =
      typeof style?.width === "number"
        ? style.width
        : parseInt(style?.width as string);
    const rawH =
      typeof style?.height === "number"
        ? style.height
        : parseInt(style?.height as string);
    const width = Math.round(
      rawW ||
        (typeof measured?.width === "number" ? measured.width : undefined) ||
        (typeof (n as any).width === "number" ? (n as any).width : undefined) ||
        250,
    );
    const height = Math.round(
      rawH ||
        (typeof measured?.height === "number" ? measured.height : undefined) ||
        (typeof (n as any).height === "number"
          ? (n as any).height
          : undefined) ||
        140,
    );
    const color = data.color as string | undefined;

    const base = {
      id,
      x: Math.round(position.x),
      y: Math.round(position.y),
      width,
      height,
      color,
    };

    switch (n.type) {
      case "canvasText":
        return { ...base, type: "text", text: (data.text as string) || "" };
      case "canvasFile":
        return {
          ...base,
          type: "file",
          file: (data.file as string) || "",
          subpath: data.subpath as string | undefined,
        };
      case "canvasLink":
        return { ...base, type: "link", url: (data.url as string) || "" };
      case "canvasGroup":
        return {
          ...base,
          type: "group",
          label: data.label as string | undefined,
          background: data.background as string | undefined,
          backgroundStyle: data.backgroundStyle as any,
        };
      default:
        // Fallback for unknown node types if any sneak in
        return { ...base, type: "text", text: "" };
    }
  });

  const canvasEdges: CanvasEdge[] = realEdges.map((e) => {
    return {
      id: e.id,
      fromNode: e.source,
      fromSide: e.sourceHandle as Side | undefined,
      toNode: e.target,
      toSide: e.targetHandle as Side | undefined,
      label: e.label as string | undefined,
      color: e.data?.color as string | undefined,
    };
  });

  return { nodes: canvasNodes, edges: canvasEdges };
}
