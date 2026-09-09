/** A tree note chosen for opening (or instant-create, which flags a one-time
 * title-rename flow). */
export interface NoteSelection {
  name: string;
  path: string;
  /** Transient: enter the note's title-rename flow once on open (note creation). */
  renameOnOpen?: boolean;
}

/** A tree item chosen for renaming — cross-feature rename is delegated to the
 *  caller (shared/useWorkspace) via `onRenameNode`: it decides notes vs
 *  folders/attachments, refreshes the tree, and repoints open tabs. */
export interface RenameTarget {
  path: string;
  name: string;
  isFolder: boolean;
}

/** The note-open surface the vault controller talks to (tabs-adjacent wiring
 * owned by the caller). */
export interface VaultNoteController {
  selected: NoteSelection | null;
  loadNote: (note: NoteSelection) => void | Promise<void>;
  closeNote: () => void;
}
