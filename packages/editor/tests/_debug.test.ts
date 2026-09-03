import { it } from "vitest";
import { EditorState, type Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { livePreviewPlugin, livePreviewField } from "../src/preview/live-preview";
import { renderModeReading } from "../src/preview/render-mode";
import { blockWidgetSpecsFacet } from "../src/block-widgets/registry";
import { tableBlockSpec } from "../src/block-widgets/table-widget";
import { parseMarkdown } from "./_helpers/parse-markdown";

it("debug table tree", () => {
  const table = "| A | B |\n|---|---|\n| 1 | 2 |";
  const extensions: Extension[] = [livePreviewPlugin, blockWidgetSpecsFacet.of(tableBlockSpec), renderModeReading];
  const { state, tree } = parseMarkdown(table, { extensions, selection: 0 });
  console.log(tree.toString());
  const field = state.field(livePreviewField, false)!;
  const ids: string[] = [];
  field.decorations.between(0, state.doc.length, (_f,_t,v)=>{ if ("widget" in v && v.widget) ids.push((v.widget.constructor as any).name); });
  console.log("widgets:", ids);
  const marks: string[] = [];
  field.decorations.between(0, state.doc.length, (_f,_t,v)=>{ if (v.spec.class) marks.push(String(v.spec.class)); });
  console.log("marks:", marks);
  console.error("facet:", state.facet(<any>"renderMode")); 
});
