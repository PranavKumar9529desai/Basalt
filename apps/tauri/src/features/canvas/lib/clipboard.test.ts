import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import type { CanvasXYNode } from "./mapper";
import type { CanvasDocument } from "../types";
import {
  CANVAS_PASTE_OFFSET,
  buildCanvasSnapshot,
  classifyFileType,
  fileUriToPath,
  isEditableTarget,
  plainTextOfDocument,
  readPastePayload,
  remapSnapshotForPaste,
} from "./clipboard";
import type { PasteOsReader } from "./clipboard";

function xyNode(
  partial: Partial<CanvasXYNode> & Pick<CanvasXYNode, "id" | "type">,
): CanvasXYNode {
  return {
    position: { x: 0, y: 0 },
    style: { width: 250, height: 140 },
    data: {},
    ...partial,
  } as CanvasXYNode;
}

const fileA: CanvasXYNode = xyNode({
  id: "file-a",
  type: "canvasFile",
  style: { width: 300, height: 220 },
  data: { file: "notes/My note.md" },
  selected: true,
});
const textB: CanvasXYNode = xyNode({
  id: "text-b",
  type: "canvasText",
  data: { text: "hello" },
  selected: true,
});
const linkC: CanvasXYNode = xyNode({
  id: "link-c",
  type: "canvasLink",
  data: { url: "https://example.com" },
});

function edge(
  partial: Partial<Edge> & Pick<Edge, "id" | "source" | "target">,
): Edge {
  return { ...partial } as Edge;
}

const sampleDoc: CanvasDocument = {
  nodes: [
    {
      id: "file-a",
      type: "file",
      x: 10,
      y: 20,
      width: 300,
      height: 220,
      file: "notes/My note.md",
    },
    {
      id: "text-b",
      type: "text",
      x: 40,
      y: 50,
      width: 250,
      height: 140,
      text: "hi",
    },
    {
      id: "link-c",
      type: "link",
      x: 1,
      y: 1,
      width: 260,
      height: 100,
      url: "https://example.com",
    },
    {
      id: "group-d",
      type: "group",
      x: 2,
      y: 2,
      width: 400,
      height: 300,
      label: "Box",
    },
  ],
  edges: [
    {
      id: "e-ab",
      fromNode: "file-a",
      toNode: "text-b",
    },
    {
      id: "e-cb",
      fromNode: "link-c", // link-c is NOT selected → dropped
      toNode: "text-b",
    },
  ],
};

describe("buildCanvasSnapshot", () => {
  it("returns null when nothing is selected", () => {
    expect(buildCanvasSnapshot([linkC], [])).toBeNull();
  });

  it("snapshots selected nodes and drops edges touching unselected nodes", () => {
    const edges = [
      edge({ id: "e-ab", source: "file-a", target: "text-b" }),
      edge({ id: "e-cb", source: "link-c", target: "text-b" }),
    ];
    const snap = buildCanvasSnapshot([fileA, textB, linkC], edges);
    expect(snap?.v).toBe(1);
    const ids = snap?.doc.nodes?.map((n) => n.id);
    expect(ids).toContain("file-a");
    expect(ids).toContain("text-b");
    expect(ids).not.toContain("link-c");
    expect(snap?.doc.edges?.map((e) => e.id)).toEqual(["e-ab"]);
  });
});

describe("plainTextOfDocument", () => {
  it("renders files as folder-preserving wikilinks and skips groups", () => {
    expect(plainTextOfDocument(sampleDoc)).toBe(
      "[[notes/My note]]\nhi\nhttps://example.com",
    );
  });
});

describe("remapSnapshotForPaste", () => {
  it("offsets positions and remaps edge endpoints through fresh ids", () => {
    const snap = { v: 1 as const, doc: sampleDoc };
    const out = remapSnapshotForPaste(snap);

    expect(out.nodes).toHaveLength(4);
    const a = out.nodes!.find((n) => n.type === "file")!;
    expect(a.id).not.toBe("file-a");
    expect(a.id.startsWith("file-")).toBe(true);
    expect(a.x).toBe(10 + CANVAS_PASTE_OFFSET);
    expect(a.y).toBe(20 + CANVAS_PASTE_OFFSET);

    const edgeA = out.edges!.find((e) => e.id.includes("e-ab"))!;
    const textId = out.nodes!.find((n) => n.type === "text")!.id;
    expect(edgeA.fromNode).toBe(a.id);
    expect(edgeA.toNode).toBe(textId);

    // Edges land wherever their endpoints are remapped — every node in the
    // snapshot is copied, so the link→text edge survives with fresh ids.
    const edgeC = out.edges!.find((e) => e.id.includes("e-cb"))!;
    const linkId = out.nodes!.find((n) => n.type === "link")!.id;
    expect(edgeC.fromNode).toBe(linkId);
    expect(edgeC.toNode).toBe(textId);
  });
});

describe("fileUriToPath", () => {
  it("strips and decodes file:// URIs", () => {
    expect(fileUriToPath("file:///home/u/a%20b.png")).toBe("/home/u/a b.png");
  });
  it("passes plain paths through", () => {
    expect(fileUriToPath("/home/u/a.png")).toBe("/home/u/a.png");
  });
});

describe("classifyFileType", () => {
  it("classifies image, audio, and plain files", () => {
    expect(classifyFileType("_attachments/photo.png")).toBe("image");
    expect(classifyFileType("_attachments/audio.mp3")).toBe("audio");
    expect(classifyFileType("notes/report.md")).toBe("file");
  });
});

describe("readPastePayload", () => {
  const os: PasteOsReader = {
    async readText() {
      return "fallback text";
    },
    async readImage() {
      return null;
    },
    async readUriList() {
      return ["file:///tmp/one.md"];
    },
  };

  it("reads text, image, and uris from the OS reader when no event data", async () => {
    const withImage: PasteOsReader = {
      ...os,
      async readImage() {
        return new Uint8Array([1, 2, 3]);
      },
    };
    const payload = await readPastePayload(null, withImage);
    expect(payload.text).toBe("fallback text");
    expect(payload.image?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(payload.uris).toEqual(["file:///tmp/one.md"]);
  });

  it("prefers event clipboardData (uri-list + image file)", async () => {
    const files = [new File(["pngdata"], "shot.png", { type: "image/png" })];
    const event = {
      clipboardData: {
        getData: (type: string) =>
          type === "text/uri-list" ? "file:///tmp/a.md\r\n" : "", // text/plain absent
        files,
      },
    } as unknown as ClipboardEvent;
    const payload = await readPastePayload(event, os);
    expect(payload.image?.name).toBe("shot.png");
    expect(payload.image?.bytes).toEqual(
      new Uint8Array(await files[0].arrayBuffer()),
    );
    expect(payload.uris).toEqual(["file:///tmp/a.md"]);
  });

  it("appends non-image OS files to uris", async () => {
    const files = [new File(["x"], "some.doc", { type: "application/msword" })];
    const event = { clipboardData: { getData: () => "", files } } as unknown as ClipboardEvent;
    const payload = await readPastePayload(event, os);
    expect(payload.uris).toEqual(["some.doc"]);
  });
});

describe("isEditableTarget", () => {
  it("flags inputs, textareas, and contenteditable elements", () => {
    const input = document.createElement("input");
    expect(isEditableTarget(input)).toBe(true);
    const div = document.createElement("div");
    expect(isEditableTarget(div)).toBe(false);
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(null)).toBe(false);
  });
});