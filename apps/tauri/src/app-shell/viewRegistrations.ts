import { lazy } from "react";
import { IconFileText, IconFolder, IconLink } from "@tabler/icons-react";
import { leafRegistry, viewRegistry } from "@workspace/views";
import { MarkdownEditorView } from "../features/editor";
import { BacklinksView } from "./views/BacklinksView";

import {
  FileExplorerHeaderActions,
  FileExplorerView,
} from "./views/FileExplorerView";

// Graph is the only leaf that pulls in WebGL + a wasm force-sim worker — keep
// it out of the startup bundle (ADR-007: lazy-load non-critical panels).
const GraphView = lazy(() =>
  import("../features/graph").then((m) => ({ default: m.GraphView })),
);

/**
 * Boot-time view registrations (ADR-018).
 *
 * Explicit list — imported once by WorkspaceView for its side effects.
 * The set of live views is deterministic and greppable from this file.
 * First-party views and future plugins use the identical registration
 * path.
 */
viewRegistry.register({
  type: "file-explorer",
  name: "Files",
  icon: IconFolder,
  side: "left",
  component: FileExplorerView,
  headerActions: FileExplorerHeaderActions,
});

viewRegistry.register({
  type: "backlinks",
  name: "Backlinks",
  icon: IconLink,
  side: "right",
  component: BacklinksView,
});

leafRegistry.register({
  type: "markdown",
  name: "Markdown",
  icon: IconFileText,
  extensions: [".md", ".markdown"],
  component: MarkdownEditorView,
});
leafRegistry.register({
  type: "graph",
  name: "Graph",
  extensions: [],
  component: GraphView,
});
