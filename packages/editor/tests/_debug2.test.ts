import { it } from "vitest";
import { syntaxTree } from "@codemirror/language";
import { blockWidgetSpecsFacet } from "../src/block-widgets/registry";
import { tableBlockSpec } from "../src/block-widgets/table-widget";
import { parseMarkdown } from "./_helpers/parse-markdown";

it("debug table variants", () => {
  const variants = [
    "| A | B |\n|---|---|\n| 1 | 2 |",
    "a|b\n-|-\n1|2",
    "| A | B |\n| --- | --- |\n| 1 | 2 |",
    "text\n\n| A | B |\n|---|---|\n| 1 | 2 |",
  ];
  for (const t of variants) {
    const { state, tree } = parseMarkdown(t, { selection: 0 });
    console.error("[variant]");
    console.error(tree.toString());
  }
});
