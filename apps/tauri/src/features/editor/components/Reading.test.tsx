import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Reading } from "./Reading";

const services = {
  findNote: vi.fn(() => undefined),
  openNote: vi.fn(),
};

describe("Reading", () => {
  it("renders the note as readable content instead of raw Markdown", () => {
    render(
      <Reading
        title="A note"
        sourcePath="A note.md"
        markdown={
          "---\nstatus: draft\ntags: [react, typescript]\n---\n# Heading\n\n**bold** and [[Target]]"
        }
        services={services}
      />,
    );

    expect(screen.getByRole("heading", { name: "A note" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Heading" })).toBeTruthy();
    expect(screen.getByText("draft")).toBeTruthy();
    expect(screen.getByText("react")).toBeTruthy();
    expect(screen.getByText("typescript")).toBeTruthy();
    expect(
      screen.getByLabelText("Properties").querySelector("svg"),
    ).toBeTruthy();
    expect(screen.getByText("bold").closest("strong")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Target" })).toBeTruthy();
    expect(screen.queryByText("# Heading")).toBeNull();
  });

  it("renders task items and rejects unsafe link protocols", () => {
    render(
      <Reading
        title="Links"
        sourcePath="Links.md"
        markdown={"- [x] finished\n\n[unsafe](javascript:alert(1))"}
        services={services}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.queryByRole("link", { name: "unsafe" })).toBeNull();
    expect(screen.getByText("[unsafe](javascript:alert(1))")).toBeTruthy();
  });

  it("renders fenced and indented code blocks as <pre><code>", () => {
    render(
      <Reading
        title="Code"
        sourcePath="Code.md"
        markdown={
          "```ts\nconst x: number = 1;\n```\n\nindented:\n\n    const a = 1;\n    const b = 2;\n"
        }
        services={services}
      />,
    );

    const preBlocks = document.querySelectorAll(".markdown-reading-sizer pre");
    expect(preBlocks.length).toBe(2);
    const [fenced, indented] = Array.from(preBlocks);
    expect(fenced.querySelector("code")?.textContent).toContain(
      "const x: number = 1;",
    );
    expect(fenced.querySelector("code")?.getAttribute("data-language")).toBe(
      "ts",
    );
    expect(indented.querySelector("code")?.textContent).toContain(
      "const a = 1;",
    );
    expect(indented.querySelector("code")?.textContent).toContain(
      "const b = 2;",
    );
  });

  it("does not truncate fenced code nested inside a list item", () => {
    render(
      <Reading
        title="Nested"
        sourcePath="Nested.md"
        markdown={
          "- item with code:\n\n  ```ts\n  const x: number = 1;\n  console.log(x);\n  ```\n"
        }
        services={services}
      />,
    );

    const code = document.querySelector(".markdown-reading-sizer pre code");
    expect(code?.textContent).toContain("const x: number = 1;");
    expect(code?.textContent).toContain("console.log(x);");
  });

  it("keeps the title above the properties section", () => {
    render(
      <Reading
        title="Ordered.md"
        sourcePath="Ordered.md"
        markdown={"---\nstatus: draft\n---\nbody\n"}
        services={services}
      />,
    );

    const title = screen.getByRole("heading", { name: "Ordered" });
    const properties = screen.getByLabelText("Properties");
    expect(title.compareDocumentPosition(properties)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("syntax-highlights recognised code blocks", async () => {
    render(
      <Reading
        title="Highlight"
        sourcePath="Highlight.md"
        markdown={"```ts\nconst answer: number = 42;\n```\n"}
        services={services}
      />,
    );

    await waitFor(() => {
      expect(
        document.querySelector(".markdown-reading-sizer .sat-syntax-keyword"),
      ).toBeTruthy();
    });
  });

  it("renders raw HTML blocks as sanitized rich content", () => {
    render(
      <Reading
        title="Html"
        sourcePath="Html.md"
        markdown={
          "<details><summary>Click</summary><p>Hidden text</p></details>"
        }
        services={services}
      />,
    );

    expect(document.querySelector(".markdown-reading-html")).toBeTruthy();
    expect(document.querySelector("details")).toBeTruthy();
    expect(document.querySelector("summary")?.textContent).toBe("Click");
  });

  it("strips script and event handlers from rendered HTML", () => {
    const markdown =
      '<div onclick="alert(1)"><script>alert(2)</script><img src=x onerror=alert(3)>safe</div>';
    render(
      <Reading
        title="Xss"
        sourcePath="Xss.md"
        markdown={markdown}
        services={services}
      />,
    );

    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")?.getAttribute("onerror")).toBeNull();
    const htmlBlock = document.querySelector(".markdown-reading-html");
    expect(htmlBlock?.textContent).toContain("safe");
  });

  it("keeps inline HTML tags visible as raw text", () => {
    render(
      <Reading
        title="Inline"
        sourcePath="Inline.md"
        markdown={'Hello <span style="color:red">world</span>!'}
        services={services}
      />,
    );

    expect(document.body.textContent).toContain("<span");
    expect(document.body.textContent).toContain("world");
  });
});
