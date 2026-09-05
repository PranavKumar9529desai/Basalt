import type { ComponentType } from "react";
import { createContext, useContext, type ReactNode } from "react";
import type { ViewIconType } from "./types";

/**
 * Minimal tab info passed to leaf components. Structural — the tabs
 * feature's TabModel is assignable to this.
 */
export interface LeafTabInfo {
  id: string;
  path: string;
  title: string;
  /** Presentation mode for Markdown leaves. */
  viewMode?: "edit" | "reading";
  /** Transient: line to reveal once on open (search jump-to-line). Not persisted. */
  line?: number;
  /** Transient: focus the note body once after opening. Not persisted. */
  focusOnOpen?: boolean;
  /** Transient: enter the leaf's title-rename flow once on first show.
   * Set by note creation; cleared by the leaf after entering. Not persisted. */
  renameOnOpen?: boolean;
}

export interface LeafProps {
  tab: LeafTabInfo;
  /** Id of the leaf's pane — lets leaves register per-pane singletons
   * (e.g. an editor controller) against this pane's lifecycle. */
  paneId: string;
}

/** Result of a leaf-initiated note rename (inline title commit). */
export type RenameResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Services a leaf may need from the workbench. Provided by the shell
 * (WorkspaceShell) around the leaf content — the same role Obsidian's
 * `app` object plays for its views. Features stay decoupled: the markdown
 * leaf never imports the tabs feature, it calls `services.openNote`.
 */
export interface LeafServices {
  /** Open a note by path (preview tab) — wikilinks, backlinks, search. */
  openNote: (path: string) => void;
  /** Flip a tab's dirty flag in the tabs store. */
  markTabDirty: (tabId: string, dirty: boolean) => void;
  /** Resolve a note name (e.g. wikilink target) to a tree node. */
  findNote: (name: string) => { name: string; path: string } | undefined;
  /** Snapshot of every open tab id, across all panes. Leaves key per-tab
   * caches by tab id and prune on tab close via onTabStructureChanged. */
  getOpenTabIds: () => Set<string>;
  /** Snapshot of every open tab's note path. Pruning must match on path
   * too: a tab whose id changed (rename/move rekey) is NOT closed. */
  getOpenTabPaths: () => Set<string>;
  /** Live {path, title} for an open tab id, read from the tabs store.
   * Leaves refresh their per-tab metadata caches from this when moves
   * repoint a tab's path without changing its id. Returns null if the
   * tab is closed. */
  getTabInfo: (tabId: string) => { path: string; title: string } | null;
  /** Fires after structural tab mutations (open/close/pin/rename). Returns
   * an unsubscribe function. Ephemeral changes (dirty/active) don't fire. */
  onTabStructureChanged: (cb: () => void) => () => void;
  /** Active note {path,name} (or null) — graph's local-graph root. */
  activeNote: { path: string; name: string } | null;
  /** Open a note as a pinned (non-preview) tab — graph node "open in new tab". */
  openPinned: (
    note: { path: string; title?: string },
    options?: { activate?: boolean },
  ) => string;
  /** Rename the open note behind a tab (inline-title commit). Repoints the
   * tab's path/title, refreshes the tree, and rewrites wikilinks backend-side. */
  renameNote: (
    tab: { id: string; path: string },
    newName: string,
  ) => Promise<RenameResult>;
  /** Resolve an embed target (`![[target]]`) to a loadable asset URL.
   *  Returns `null` when the target is not a resolvable file. */
  resolveAsset?: (target: string) => string | null;
}

const LeafServicesContext = createContext<LeafServices | null>(null);

export function LeafServicesProvider({
  services,
  children,
}: {
  services: LeafServices;
  children: ReactNode;
}) {
  return (
    <LeafServicesContext.Provider value={services}>
      {children}
    </LeafServicesContext.Provider>
  );
}

export function useLeafServices(): LeafServices {
  const services = useContext(LeafServicesContext);
  if (!services) {
    throw new Error("useLeafServices must be used within LeafServicesProvider");
  }
  return services;
}

/**
 * A registrable leaf type (ADR-018 Phase 2) — the kind of content a tab
 * renders ("markdown", later "html", "graph", ...). Tabs carry a
 * `leafType` resolved at creation time from the file extension.
 */
export interface LeafDescriptor {
  /** Stable unique id, e.g. "markdown". */
  type: string;
  /** Human-readable name. */
  name: string;
  /** Optional icon (tab switchers, future UI derived from the registry). */
  icon?: ViewIconType;
  /** File extensions this leaf type handles, e.g. [".md", ".markdown"]. */
  extensions: string[];
  component: ComponentType<LeafProps>;
}

/**
 * LeafRegistry — same pattern as ViewRegistry/CommandService: providers
 * register by string key, the pane resolver looks up by the tab's
 * `leafType`.
 */
export class LeafRegistry {
  private leaves = new Map<string, LeafDescriptor>();

  register(leaf: LeafDescriptor): void {
    if (this.leaves.has(leaf.type)) {
      console.warn(`Leaf "${leaf.type}" is already registered. Overwriting.`);
    }
    this.leaves.set(leaf.type, leaf);
  }

  unregister(type: string): void {
    this.leaves.delete(type);
  }

  get(type: string): LeafDescriptor | undefined {
    return this.leaves.get(type);
  }

  /** Resolve a file path to a registered leaf type via extension. */
  leafTypeForPath(path: string): string | null {
    const lower = path.toLowerCase();
    for (const leaf of this.leaves.values()) {
      if (leaf.extensions.some((ext) => lower.endsWith(ext))) {
        return leaf.type;
      }
    }
    return null;
  }

  getAll(): LeafDescriptor[] {
    return [...this.leaves.values()];
  }
}

export const leafRegistry = new LeafRegistry();
