/**
 * Save scheduling policy for the direct-editing editor.
 *
 * One debounce timer guards all saves: every keystroke (via the update
 * listener) resets it, so rapid typing coalesces into a single write 2s after
 * the last keystroke. Debouncing autosave is the whole point — per-keystroke
 * IPC would saturate the main process and make typing janky.
 *
 * Not every flush goes through the timer: tab switches, window blur, and
 * unmount bypass the delay so an edit is never left unpersisted just because
 * the user moved on. The controller's `scheduleSave`/`cancelScheduledSave`
 * implement this one-timer policy.
 */
export const AUTOSAVE_DEBOUNCE_MS = 2000;
