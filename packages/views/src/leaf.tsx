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
}

export interface LeafProps {
  tab: LeafTabInfo;
}

/**
 * Services a leaf may need from the workbench. Provided by the shell
 * (WorkspaceShell) around the leaf content — the same role Obsidian's
 * `app` object plays for its views. Features stay decoupled: the markdown
 * leaf never imports the tabs feature, it calls `services.openNote`.
 */
export interface LeafServices {
  /** Open a note in a preview tab. */
  openNote: (note: { path: string; name: string }) => void;
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
  /** Fires after structural tab mutations (open/close/pin/rename). Returns
   * an unsubscribe function. Ephemeral changes (dirty/active) don't fire. */
  onTabStructureChanged: (cb: () => void) => () => void;
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
 * `viewType` resolved at creation time from the file extension.
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
 * `viewType`.
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
  viewTypeForPath(path: string): string | null {
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
