import { lazy } from "react";
import { IconFileText, IconFolder, IconLink } from "@tabler/icons-react";
import { leafRegistry, viewRegistry } from "@workspace/views";
import { EditorView } from "../features/editor";
import { Backlinks } from "./views/Backlinks";

import { FileExplorerHeaderActions, FileExplorer } from "./views/FileExplorer";

// Graph is the only leaf that pulls in WebGL + a wasm force-sim worker — keep
// it out of the startup bundle (ADR-007: lazy-load non-critical panels).
const Graph = lazy(() =>
  import("../features/graph").then((m) => ({ default: m.Graph })),
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
