import type { ComponentType } from "react";

/** Which side dock a view lives in. */
export type ViewSide = "left" | "right";

/**
 * Icon component for the view — used by dock tab switchers and (later)
 * ribbon items derived from registered views. Tabler icons match this
 * signature.
 */
export type ViewIconType = ComponentType<{
  size?: number;
  stroke?: number;
}>;

/**
 * Optional header content rendered inside the dock's header strip while
 * this view is active (e.g. the file explorer's new-note/folder actions).
 * Rendered as `<ActiveView.headerActions />` so it can use app context.
 */
export type ViewHeaderActionsType = ComponentType<Record<string, never>>;

/**
 * A registrable workbench view (ADR-018).
 *
 * Views are the unit of UI contribution: side docks render whatever is
 * registered for their side; nothing imports a view directly. First-party
 * features and future plugins use the identical registration path.
 */
export interface ViewDescriptor {
  /** Stable unique id, e.g. "file-explorer", "backlinks". */
  type: string;
  /** Human-readable name shown in tab switchers and tooltips. */
  name: string;
  icon: ViewIconType;
  side: ViewSide;
  /** The view's content. Self-contained: reads app context / stores. */
  component: ComponentType<Record<string, never>>;
  /** Optional actions rendered in the dock header while active. */
  headerActions?: ViewHeaderActionsType;
}
