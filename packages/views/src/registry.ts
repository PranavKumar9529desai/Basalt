import type { ViewDescriptor, ViewSide } from "./types";

/**
 * ViewRegistry — central registry of workbench views (ADR-018).
 *
 * Same pattern as CommandService: providers register by string key,
 * consumers (side docks) look up by string key. The registry never
 * imports from features; registration happens in the shell's explicit
 * boot-time registration list (app-shell/viewRegistrations.ts) so the
 * set of live views is deterministic.
 */
export class ViewRegistry {
  private views = new Map<string, ViewDescriptor>();

  register(view: ViewDescriptor): void {
    if (this.views.has(view.type)) {
      console.warn(`View "${view.type}" is already registered. Overwriting.`);
    }
    this.views.set(view.type, view);
  }

  unregister(type: string): void {
    this.views.delete(type);
  }

  get(type: string): ViewDescriptor | undefined {
    return this.views.get(type);
  }

  /** All views for a side, in registration order. */
  getBySide(side: ViewSide): ViewDescriptor[] {
    return [...this.views.values()].filter((v) => v.side === side);
  }

  getAll(): ViewDescriptor[] {
    return [...this.views.values()];
  }
}

export const viewRegistry = new ViewRegistry();
