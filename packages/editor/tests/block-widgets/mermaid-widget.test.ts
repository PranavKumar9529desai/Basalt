import { describe, expect, it, vi, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  mermaidBlockSpec,
  clearMermaidCache,
  defaultMermaidTheme,
} from "../../src/block-widgets/mermaid-widget";
import { registerBlockWidget } from "../../src/block-widgets/registry";
import { renderModeFacet } from "../../src/preview/render-mode";
import { livePreviewField } from "../../src/preview/live-preview";
import { testMarkdownFixture } from "../_helpers/test-fixture";
import type { SyntaxNodeRef } from "@lezer/common";

// Mock mermaid module so unit tests do not require a real canvas/SVG DOM engine
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation(async (_id: string, text: string) => ({
      svg: `<svg data-diagram="${text}"><g></g></svg>`,
    })),
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

describe("mermaidBlockSpec", () => {
  beforeEach(() => {
    clearMermaidCache();
    vi.clearAllMocks();
  });

  describe("matches", () => {
    it("matches FencedCode nodes", () => {
      expect(mermaidBlockSpec.matches(mockNode("FencedCode", 0, 20))).toBe(
        true,
      );
      expect(mermaidBlockSpec.matches(mockNode("CodeBlock", 0, 20))).toBe(
        false,
      );
      expect(mermaidBlockSpec.matches(mockNode("Paragraph", 0, 20))).toBe(
        false,
      );
    });
  });

  describe("parse", () => {
    it("parses ```mermaid code blocks into a model", () => {
      const doc = "```mermaid\ngraph TD\n  A-->B\n```\n\nOther text";
      const state = EditorState.create({
        doc,
        selection: { anchor: doc.length - 1 }, // cursor outside block
        extensions: [renderModeFacet.of("live"), defaultMermaidTheme],
      });

      const model = mermaidBlockSpec.parse!(
        state,
        mockNode("FencedCode", 0, 31),
      );
      expect(model).not.toBeNull();
      expect(model?.diagramText).toBe("graph TD\n  A-->B");
      expect(model?.from).toBe(0);
      expect(model?.to).toBe(31);
      expect(model?.inCursor).toBe(false);
    });

    it("ignores non-mermaid code blocks", () => {
      const doc = "```typescript\nconst x = 1;\n```";
      const state = EditorState.create({
        doc,
        extensions: [renderModeFacet.of("live")],
      });

      const model = mermaidBlockSpec.parse!(
        state,
        mockNode("FencedCode", 0, doc.length),
      );
      expect(model).toBeNull();
    });

    it("returns null for empty mermaid blocks", () => {
      const doc = "```mermaid\n\n```";
      const state = EditorState.create({
        doc,
        extensions: [renderModeFacet.of("live")],
      });

      const model = mermaidBlockSpec.parse!(
        state,
        mockNode("FencedCode", 0, doc.length),
      );
      expect(model).toBeNull();
    });

    it("sets inCursor to true when selection is inside the block in live mode", () => {
      const doc = "```mermaid\ngraph TD\n  A-->B\n```";
      const state = EditorState.create({
        doc,
        selection: { anchor: 15 },
        extensions: [renderModeFacet.of("live"), defaultMermaidTheme],
      });

      const model = mermaidBlockSpec.parse!(
        state,
        mockNode("FencedCode", 0, doc.length),
      );
      expect(model?.inCursor).toBe(true);
    });

    it("keeps inCursor as false in reading mode even when caret is on the block", () => {
      const doc = "```mermaid\ngraph TD\n  A-->B\n```";
      const state = EditorState.create({
        doc,
        selection: { anchor: 15 },
        extensions: [renderModeFacet.of("reading"), defaultMermaidTheme],
      });

      const model = mermaidBlockSpec.parse!(
        state,
        mockNode("FencedCode", 0, doc.length),
      );
      expect(model?.inCursor).toBe(false);
    });
  });

  describe("span & render", () => {
    it("returns full span when not inCursor and null when inCursor", () => {
      const state = EditorState.create({ doc: "" });
      const modelOut = {
        diagramText: "graph TD\n  A-->B",
        from: 0,
        to: 30,
        inCursor: false,
        theme: "dark",
      };
      const modelIn = { ...modelOut, inCursor: true };

      expect(mermaidBlockSpec.span!(modelOut, state)).toEqual({
        from: 0,
        to: 30,
      });
      expect(mermaidBlockSpec.span!(modelIn, state)).toBeNull();
    });

    it("returns MermaidWidget when not inCursor and null when inCursor", () => {
      const state = EditorState.create({
        doc: "```mermaid\ngraph TD\n  A-->B\n```",
        extensions: [renderModeFacet.of("live")],
      });
      const modelOut = {
        diagramText: "graph TD\n  A-->B",
        from: 0,
        to: 30,
        inCursor: false,
        theme: "dark",
      };
      const modelIn = { ...modelOut, inCursor: true };

      const widget = mermaidBlockSpec.render!(modelOut, state);
      expect(widget).not.toBeNull();
      expect(widget?.constructor.name).toBe("MermaidWidget");

      expect(mermaidBlockSpec.render!(modelIn, state)).toBeNull();
    });
  });

  describe("MermaidWidget DOM and caching", () => {
    it("supports eq() comparison", () => {
      const state = EditorState.create({
        doc: "```mermaid\ngraph TD\n  A-->B\n```",
        extensions: [renderModeFacet.of("live")],
      });
      const model1 = {
        diagramText: "graph TD\n  A-->B",
        from: 0,
        to: 30,
        inCursor: false,
        theme: "dark",
      };
      const model2 = { ...model1 };
      const modelDiff = { ...model1, diagramText: "graph LR\n  A-->B" };

      const w1 = mermaidBlockSpec.render!(model1, state)!;
      const w2 = mermaidBlockSpec.render!(model2, state)!;
      const wDiff = mermaidBlockSpec.render!(modelDiff, state)!;

      expect(w1.eq(w2)).toBe(true);
      expect(w1.eq(wDiff)).toBe(false);
    });

    it("renders loading placeholder then updates with SVG", async () => {
      const state = EditorState.create({
        doc: "```mermaid\ngraph TD\n  A-->B\n```",
        extensions: [renderModeFacet.of("live")],
      });
      const model = {
        diagramText: "graph TD\n  A-->B",
        from: 0,
        to: 30,
        inCursor: false,
        theme: "dark",
      };

      const widget = mermaidBlockSpec.render!(model, state)!;
      const container = widget.toDOM({
        dispatch: vi.fn(),
        requestMeasure: vi.fn(),
        state,
      } as any);
      expect(container.classList.contains("cm-mermaid-container")).toBe(true);
      expect(container.querySelector(".cm-mermaid-loading")).not.toBeNull();

      // Attach container to DOM so async render completes
      document.body.appendChild(container);

      // Wait for microtask / async import
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(container.querySelector(".cm-mermaid-svg")).not.toBeNull();
      expect(container.querySelector(".cm-mermaid-loading")).toBeNull();

      container.remove();
    });
  });

  describe("integration in live preview", () => {
    it("creates MermaidWidget decoration for ```mermaid in live preview", () => {
      const doc = "```mermaid\ngraph TD\n  A-->B\n```\n\nSome text";
      const fixture = testMarkdownFixture(doc, {
        renderMode: "live",
        extensions: [
          registerBlockWidget(mermaidBlockSpec),
          defaultMermaidTheme,
        ],
        selection: doc.length - 1, // cursor on 'Some text'
      });

      const preview = fixture.state.field(livePreviewField);
      let foundMermaidWidget = false;
      preview.decorations.between(0, doc.length, (_from, _to, deco) => {
        if (deco.spec.widget?.constructor.name === "MermaidWidget") {
          foundMermaidWidget = true;
        }
      });
      expect(foundMermaidWidget).toBe(true);
    });
  });
});
