import { describe, expect, it } from "vitest";

import { splitTemplateFrontmatter } from "./split-frontmatter";

describe("splitTemplateFrontmatter", () => {
  it("returns null frontmatter when the template has no leading block", () => {
    expect(splitTemplateFrontmatter("# Meeting\n\nagenda")).toEqual({
      frontmatter: null,
      body: "# Meeting\n\nagenda",
    });
  });

  it("splits a frontmatter block from the body", () => {
    const result = splitTemplateFrontmatter(
      "---\ntags:\n  - project\nstatus: active\n---\n\n# {{title}}\n\nbody",
    );
    expect(result.frontmatter).toBe("---\ntags:\n  - project\nstatus: active\n---");
    expect(result.body).toBe("\n# {{title}}\n\nbody");
  });

  it("handles a trailing newline after the closing fence", () => {
    const result = splitTemplateFrontmatter("---\ncreated: 2026-09-07\n---\n\n# Title\n");
    expect(result.frontmatter).toBe("---\ncreated: 2026-09-07\n---");
    expect(result.body).toBe("\n# Title\n");
  });

  it("returns frontmatter-only templates with an empty body", () => {
    const result = splitTemplateFrontmatter("---\ntags: [a]\n---");
    expect(result.frontmatter).toBe("---\ntags: [a]\n---");
    expect(result.body).toBe("");
  });

  it("treats an indented block as body, not frontmatter", () => {
    const result = splitTemplateFrontmatter("  ---\ntags: [a]\n  ---\n");
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe("  ---\ntags: [a]\n  ---\n");
  });
});