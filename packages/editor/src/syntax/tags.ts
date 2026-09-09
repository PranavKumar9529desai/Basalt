import { EditorView } from "@codemirror/view";

/**
 * Adds an event listener to the editor that detects clicks on `#tag` pills
 * (`.cm-live-tag` marks produced by `handleTagsInLine`) and calls
 * `onOpenTag` with the tag WITHOUT its leading `#` — everything after it
 * stays put (no doc manipulation).
 *
 * Tags have no Lezer tree nodes (the base markdown parser keeps `#tag`
 * inside `Text`), so hit-testing uses the existing decoration mark span
 * instead of syntax-tree resolution — the same bracket-slicing discipline
 * as `targetFromWikiLinkNode`, applied to the `#` prefix.
 */
export function clickableTagsPlugin(onOpenTag?: (tag: string) => void) {
  return EditorView.domEventHandlers({
    click(event, _view) {
      if (!onOpenTag) return false;
      if (event.button !== 0 || event.ctrlKey || event.metaKey) return false;

      const target = event.target as HTMLElement | null;
      const pill = target?.closest?.(".cm-live-tag");
      if (!pill) return false;

      const text = (pill.textContent ?? "").trim();
      const tag = text.startsWith("#") ? text.slice(1) : text;
      if (!tag) return false;

      onOpenTag(tag);
      // Prevent default cursor movement when navigating.
      event.preventDefault();
      return true;
    },
  });
}
