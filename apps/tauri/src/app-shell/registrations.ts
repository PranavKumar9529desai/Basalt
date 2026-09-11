import { lazy } from "react";
import {
  IconFileText,
  IconTable,
  IconFolder,
  IconLink,
  IconTag,
  IconPaperclip,
  IconPencil,
} from "@tabler/icons-react";
import { TableControls } from "./views/TableControls";
import { leafRegistry, viewRegistry } from "@workspace/views";
import { EditorView } from "../features/editor";
import { Backlinks } from "./views/Backlinks";
import { Tags } from "./views/Tags";
import { AssetsView } from "./views/AssetsView";

import { FileExplorerHeaderActions, FileExplorer } from "./views/FileExplorer";

// Graph is the only leaf that pulls in WebGL + a wasm force-sim worker — keep
// it out of the startup bundle (ADR-007: lazy-load non-critical panels).
const Graph = lazy(() =>
  import("../features/graph").then((m) => ({ default: m.Graph })),
);
// Canvas pulls in WebGL2 viewport renderer — lazy-load like graph.
const Canvas = lazy(() =>
  import("../features/canvas").then((m) => ({ default: m.CanvasView })),
);
// Drawing pulls in Excalidraw engine — lazy-load like graph and canvas.
const Drawing = lazy(() =>
  import("../features/drawing").then((m) => ({ default: m.DrawingView })),
);

/**
 * Boot-time view registrations.
 *
 * Explicit list — imported once by Shell for its side effects.
 * The set of live views is deterministic and greppable from this file.
 * First-party views and future plugins use the identical registration
 * path.
 */
viewRegistry.register({
  type: "file-explorer",
  name: "Files",
  icon: IconFolder,
  side: "left",
  component: FileExplorer,
  headerActions: FileExplorerHeaderActions,
});

viewRegistry.register({
  type: "backlinks",
  name: "Backlinks",
  icon: IconLink,
  side: "right",
  component: Backlinks,
  section: true,
});
viewRegistry.register({
  type: "tags",
  name: "Tags",
  icon: IconTag,
  side: "right",
  component: Tags,
  section: true,
});

viewRegistry.register({
  type: "assets",
  name: "Assets",
  icon: IconPaperclip,
  side: "right",
  component: AssetsView,
  section: true,
});

viewRegistry.register({
  type: "table-controls",
  name: "Table",
  icon: IconTable,
  side: "right",
  component: TableControls,
  section: true,
});

leafRegistry.register({
  type: "markdown",
  name: "Markdown",
  icon: IconFileText,
  extensions: [".md", ".markdown"],
  component: EditorView,
});
leafRegistry.register({
  type: "graph",
  name: "Graph",
  extensions: [],
  component: Graph,
});
leafRegistry.register({
  type: "canvas",
  name: "Canvas",
  extensions: [".canvas"],
  component: Canvas,
});
leafRegistry.register({
  type: "drawing",
  name: "Drawing",
  icon: IconPencil,
  extensions: [".excalidraw.md", ".excalidraw"],
  component: Drawing,
});
