export { CommandPalette } from "./components/CommandPalette";
export { EditorView } from "./components/EditorView";
export { PasteAsPicker } from "./components/PasteAsPicker";
export {
  useActiveNoteStore,
  useRenameSignalStore,
  useTableCursorStore,
} from "./store";
export { editorControllerRegistry } from "./lib/registry";
export type { EditorController } from "./controller/EditorController";

export {
  parseFrontmatter,
  serializeFrontmatterValue,
  surgicalEdit,
  editFrontmatter,
  initFrontmatterWasm,
} from "./lib/frontmatter";
