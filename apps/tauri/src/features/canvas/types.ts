export type CanvasColor = string;

export interface NodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
}

export interface TextNode extends NodeBase {
  type: "text";
  text: string;
}

export interface FileNode extends NodeBase {
  type: "file";
  file: string;
  subpath?: string;
}

export interface LinkNode extends NodeBase {
  type: "link";
  url: string;
}

export interface GroupNode extends NodeBase {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}

export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode;

export type Side = "top" | "right" | "bottom" | "left";
export type EndShape = "none" | "arrow";

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: Side;
  fromEnd?: EndShape;
  toNode: string;
  toSide?: Side;
  toEnd?: EndShape;
  color?: CanvasColor;
  label?: string;
}

export interface CanvasDocument {
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
}
