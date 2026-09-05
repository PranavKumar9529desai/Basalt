export { CommandPalette } from "./components/CommandPalette";
export { EditorView } from "./components/EditorView";
export { useActiveNoteStore, useRenameSignalStore } from "./store";
export { editorControllerRegistry } from "./registry";
export type { EditorController } from "./controller/EditorController";

export {
  parseFrontmatter,
  serializeFrontmatterValue,
  surgicalEdit,
  editFrontmatter,
  initFrontmatterWasm,
} from "./lib/frontmatter";
