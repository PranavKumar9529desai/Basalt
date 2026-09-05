/**
 * EditorControllerRegistry — per-pane editor controller lookup.
 *
 * Every mounted editor pane registers its controller under the pane id it
 * renders in. Commands, keybinding actions, and context derivation resolve
 * the ACTIVE editor at execution time by looking up the tabs store's
 * `activePaneId` here — a single authority, never a per-pane capture
 * (VS Code's IEditorService model: register once, resolve at execution).
 *
 * Keyed delete makes ownership safe: a pane unregisters only its own entry
 * on unmount, so closing one pane can never clear another's registration.
 */
import type { EditorController } from "./controller/EditorController";

type Listener = () => void;

class EditorControllerRegistry {
  private controllers = new Map<string, EditorController>();
  private listeners = new Set<Listener>();

  register(paneId: string, controller: EditorController): void {
    this.controllers.set(paneId, controller);
    this.emit();
  }

  unregister(paneId: string): void {
    this.controllers.delete(paneId);
    this.emit();
  }

  get(paneId: string): EditorController | undefined {
    return this.controllers.get(paneId);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const editorControllerRegistry = new EditorControllerRegistry();