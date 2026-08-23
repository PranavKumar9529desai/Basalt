import { IconFolder, IconLink } from "@tabler/icons-react";
import { viewRegistry } from "@workspace/views";
import { BacklinksView } from "./views/BacklinksView";
import {
  FileExplorerHeaderActions,
  FileExplorerView,
} from "./views/FileExplorerView";

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
