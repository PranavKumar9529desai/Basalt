import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

const BULLET_GLYPHS = ["•", "◦", "▪"];

export const LISTS_THEME = EditorView.baseTheme({
  ".cm-live-list-bullet": {
    paddingLeft: "0",
  },
  ".cm-live-list-ordered": {
    paddingLeft: "0",
  },
  ".cm-live-list-depth-1": { paddingLeft: "1.5rem" },
  ".cm-live-list-depth-2": { paddingLeft: "3rem" },
  ".cm-live-list-depth-3": { paddingLeft: "4.5rem" },
  ".cm-list-bullet-widget": {
    color: "var(--sat-list-bullet-color, #6366f1)",
    display: "inline-block",
    width: "1.2em",
    marginLeft: "-1.2em",
    userSelect: "none",
  },
  ".cm-list-number-widget": {
    color: "var(--sat-list-number-color, #6366f1)",
    display: "inline-block",
    width: "1.8em",
    marginLeft: "-1.8em",
    userSelect: "none",
    textAlign: "right",
    paddingRight: "0.4em",
  },
});

export class ListBulletWidget extends WidgetType {
  constructor(private readonly depth: number) {
    super();
  }

  eq(other: ListBulletWidget) {
    return other.depth === this.depth;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-list-bullet-widget";
    span.textContent = BULLET_GLYPHS[this.depth % BULLET_GLYPHS.length];
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

export class ListNumberWidget extends WidgetType {
  constructor(private readonly number: number) {
    super();
  }

  eq(other: ListNumberWidget) {
    return other.number === this.number;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-list-number-widget";
    span.textContent = `${this.number}.`;
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

function listDepth(node: SyntaxNodeRef): number {
  let depth = 0;
  let cur = node.node.parent;
  while (cur) {
    if (cur.name === "BulletList" || cur.name === "OrderedList") depth++;
    cur = cur.parent;
  }
  return depth;
}

export function handleListNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  const name = node.type.name;

  if (name === "ListItem") {
    const doc = ctx.view.state.doc;
    const itemLine = doc.lineAt(node.from);
    const depth = listDepth(node);
    const depthClass = `cm-live-list-depth-${Math.min(depth, 3)}`;

    const endLine = doc.lineAt(node.to);
    for (let ln = itemLine.number; ln <= endLine.number; ln++) {
      const line = doc.line(ln);
      collector.addLineClass(line.from, depthClass);
    }

    return false;
  }

  if (name === "ListMark") {
    const onActiveLine = ctx.activeLine
      ? node.from >= ctx.activeLine.from && node.to <= ctx.activeLine.to
      : false;

    if (!onActiveLine) {
      const parentName = node.node.parent?.parent?.name ?? "";
      const isOrdered = parentName === "OrderedList";

      if (isOrdered) {
        let number = 1;
        let sibling = node.node.parent?.prevSibling;
        while (sibling) {
          if (sibling.name === "ListItem") number++;
          sibling = sibling.prevSibling;
        }
        const markEnd =
          node.to < ctx.view.state.doc.length &&
          ctx.view.state.doc.sliceString(node.to, node.to + 1) === " "
            ? node.to + 1
            : node.to;
        collector.addReplace(node.from, markEnd, new ListNumberWidget(number));
      } else {
        const depth = listDepth(node);
        const markEnd =
          node.to < ctx.view.state.doc.length &&
          ctx.view.state.doc.sliceString(node.to, node.to + 1) === " "
            ? node.to + 1
            : node.to;
        collector.addReplace(node.from, markEnd, new ListBulletWidget(depth));
      }
    }

    return true;
  }

  return false;
}
