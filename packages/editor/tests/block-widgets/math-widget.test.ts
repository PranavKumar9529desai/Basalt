import { describe, expect, it, vi, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  mathBlockSpec,
  MathInlineWidget,
  handleInlineMathNode,
  clearMathCache,
} from "../../src/block-widgets/math-widget";
import { registerBlockWidget } from "../../src/block-widgets/registry";
import { renderModeFacet } from "../../src/preview/render-mode";
import { livePreviewField } from "../../src/preview/live-preview";
import { testMarkdownFixture } from "../_helpers/test-fixture";
import { makeContext, makeUnfocusedContext } from "../_helpers/mock-context";
import { makeCollector } from "../_helpers/mock-collector";
import type { SyntaxNodeRef } from "@lezer/common";

vi.mock("katex", () => ({
  default: {
    renderToString: vi.fn((latex: string, opts?: { displayMode?: boolean }) => {
      const mode = opts?.displayMode ? "display" : "inline";
      return `<span class="katex-${mode}">${latex}</span>`;
    }),
  },
}));

function mockNode(name: string, from: number, to: number): SyntaxNodeRef {
  return {
    from,
    to,
    type: { name } as SyntaxNodeRef["type"],
    node: {} as any,
  } as SyntaxNodeRef;
}

describe("mathBlockSpec", () => {
  beforeEach(() => {
    clearMathCache();
    vi.clearAllMocks();
  });

  describe("matches", () => {
    it("matches BlockMath nodes", () => {
      expect(mathBlockSpec.matches(mockNode("BlockMath", 0, 10))).toBe(true);
      expect(mathBlockSpec.matches(mockNode("InlineMath", 0, 10))).toBe(false);
      expect(mathBlockSpec.matches(mockNode("Paragraph", 0, 10))).toBe(false);
    });
  });

  describe("parse", () => {
    it("parses $$...$$ block math and strips delimiters", () => {
      const doc = "$$E = mc^2$$\n\nOther text";
      const state = EditorState.create({
        doc,
        selection: { anchor: doc.length - 1 }, // cursor outside block
        extensions: [renderModeFacet.of("live")],
      });

      const model = mathBlockSpec.parse!(state, mockNode("BlockMath", 0, 12));
      expect(model).not.toBeNull();
      expect(model?.latex).toBe("E = mc^2");
      expect(model?.from).toBe(0);
      expect(model?.to).toBe(12);
      expect(model?.inCursor).toBe(false);
    });

    it("returns null for empty $$ delimiters", () => {
      const doc = "$$$$";
      const state = EditorState.create({
        doc,
        extensions: [renderModeFacet.of("live")],
      });

      const model = mathBlockSpec.parse!(
        state,
        mockNode("BlockMath", 0, doc.length),
      );
      expect(model).toBeNull();
    });

    it("sets inCursor to true when cursor is within block in live mode", () => {
      const doc = "$$\\int_0^1 x dx$$";
      const state = EditorState.create({
        doc,
        selection: { anchor: 5 },
        extensions: [renderModeFacet.of("live")],
      });

      const model = mathBlockSpec.parse!(
        state,
        mockNode("BlockMath", 0, doc.length),
      );
      expect(model?.inCursor).toBe(true);
    });
  });

  describe("span & render", () => {
    it("returns full span when not inCursor and null when inCursor", () => {
      const state = EditorState.create({ doc: "" });
      const modelOut = { latex: "a + b", from: 0, to: 10, inCursor: false };
      const modelIn = { ...modelOut, inCursor: true };

      expect(mathBlockSpec.span!(modelOut, state)).toEqual({ from: 0, to: 10 });
      expect(mathBlockSpec.span!(modelIn, state)).toBeNull();
    });

    it("returns MathBlockWidget when not inCursor and null when inCursor", () => {
      const state = EditorState.create({
        doc: "$$a + b$$",
        extensions: [renderModeFacet.of("live")],
      });
      const modelOut = { latex: "a + b", from: 0, to: 9, inCursor: false };
      const modelIn = { ...modelOut, inCursor: true };

      const widget = mathBlockSpec.render!(modelOut, state);
      expect(widget).not.toBeNull();
      expect(widget?.constructor.name).toBe("MathBlockWidget");

      expect(mathBlockSpec.render!(modelIn, state)).toBeNull();
    });
  });
});

describe("MathBlockWidget DOM", () => {
  beforeEach(() => {
    clearMathCache();
  });

  it("renders container and updates with KaTeX HTML", async () => {
    const state = EditorState.create({
      doc: "$$x = 1$$",
      extensions: [renderModeFacet.of("live")],
    });
    const model = { latex: "x = 1", from: 0, to: 9, inCursor: false };
    const widget = mathBlockSpec.render!(model, state)!;

    const mockView = new EditorView({ state });
    const container = widget.toDOM(mockView);
    expect(container.className).toBe("cm-math-block");

    document.body.appendChild(container);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(container.querySelector(".katex-display")).not.toBeNull();
    container.remove();
  });
});

describe("handleInlineMathNode", () => {
  beforeEach(() => {
    clearMathCache();
  });

  it("adds a replace decoration when cursor is on a different line", () => {
    const { ctx } = makeContext("Line 1: $E=mc^2$\nLine 2: other", {
      headPos: 20,
    }); // cursor on line 2
    const collector = makeCollector();

    const handled = handleInlineMathNode(
      mockNode("InlineMath", 8, 16),
      ctx,
      collector,
    );
    expect(handled).toBe(true);
    expect(collector.replaces).toHaveLength(1);
    expect(collector.replaces[0].from).toBe(8);
    expect(collector.replaces[0].to).toBe(16);
    expect((collector.replaces[0].widget as any).constructor.name).toBe(
      "MathInlineWidget",
    );
  });

  it("does not replace when cursor is on the same line (live mode reveal)", () => {
    const { ctx } = makeContext("Line 1: $E=mc^2$\nLine 2: other", {
      headPos: 2,
    }); // cursor on line 1
    const collector = makeCollector();

    const handled = handleInlineMathNode(
      mockNode("InlineMath", 8, 16),
      ctx,
      collector,
    );
    expect(handled).toBe(false);
    expect(collector.replaces).toHaveLength(0);
  });

  it("always replaces in reading mode (unfocused/reading)", () => {
    const { ctx } = makeUnfocusedContext("Line 1: $E=mc^2$");
    const collector = makeCollector();

    const handled = handleInlineMathNode(
      mockNode("InlineMath", 8, 16),
      ctx,
      collector,
    );
    expect(handled).toBe(true);
    expect(collector.replaces).toHaveLength(1);
  });
});

describe("MathInlineWidget DOM", () => {
  beforeEach(() => {
    clearMathCache();
  });

  it("supports eq() comparison", () => {
    const w1 = new MathInlineWidget("a + b");
    const w2 = new MathInlineWidget("a + b");
    const w3 = new MathInlineWidget("a - b");

    expect(w1.eq(w2)).toBe(true);
    expect(w1.eq(w3)).toBe(false);
  });

  it("renders container and updates with inline KaTeX HTML", async () => {
    const widget = new MathInlineWidget("x + y");
    const mockView = new EditorView({ state: EditorState.create() });
    const span = widget.toDOM(mockView);
    expect(span.className).toBe("cm-math-inline");

    document.body.appendChild(span);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(span.querySelector(".katex-inline")).not.toBeNull();
    span.remove();
  });
});

describe("integration in live preview", () => {
  it("creates MathBlockWidget decoration for $$...$$ in live preview", () => {
    const doc = "$$E = mc^2$$\n\nSome text";
    const fixture = testMarkdownFixture(doc, {
      renderMode: "live",
      extensions: [registerBlockWidget(mathBlockSpec)],
      selection: doc.length - 1, // cursor on 'Some text'
    });

    const preview = fixture.state.field(livePreviewField);
    let foundMathBlockWidget = false;
    preview.decorations.between(0, doc.length, (_from, _to, deco) => {
      if (deco.spec.widget?.constructor.name === "MathBlockWidget") {
        foundMathBlockWidget = true;
      }
    });
    expect(foundMathBlockWidget).toBe(true);
  });
});
