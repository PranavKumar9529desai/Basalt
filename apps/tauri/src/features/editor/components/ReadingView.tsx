import { parser } from "@lezer/markdown";
import type { SyntaxNode, Tree } from "@lezer/common";
import { useEffect, useMemo, useRef, type ElementType } from "react";
import type { LeafServices } from "@workspace/views";

interface ReadingViewProps {
  markdown: string;
  sourcePath: string;
  title: string;
  initialScrollRatio?: number;
  onScrollRatioChange?: (ratio: number) => void;
  services: Pick<LeafServices, "openNote" | "findNote">;
}

function maskFrontmatter(source: string): { masked: string; entries: Array<[string, string]> } {
  if (!source.startsWith("---\n")) return { masked: source, entries: [] };
  const end = source.indexOf("\n---", 4);
  if (end < 0) return { masked: source, entries: [] };
  const entries = source
    .slice(4, end)
    .split("\n")
    .map((line) => line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1], match[2]] as [string, string]);
  return {
    masked: source.slice(0, end + 4).replace(/[^\n]/g, " ") + source.slice(end + 4),
    entries,
  };
}

function maskReadingOnlySyntax(source: string): string {
  // The base Lezer Markdown grammar treats the inner `[label]` of a wikilink
  // as a normal link. Preserve offsets while hiding only the delimiters so
  // the Reading renderer can own wikilink semantics.
  return source.replace(/\[\[([^\]]+)\]\]/g, (_match, body: string) => `  ${body}  `);
}

function safeHref(value: string): string | null {
  const href = value.trim();
  if (/^(https?:|mailto:|#)/i.test(href)) return href;
  return null;
}

function textParts(text: string, onWikiLink: (name: string) => void) {
  const parts = text.split(/(\[\[[^\]]+\]\]|==[^=]+==)/g);
  return parts.map((part, index) => {
    const wiki = part.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]$/);
    if (wiki) {
      const name = wiki[1].trim();
      return (
        <button
          key={`wiki-${index}`}
          type="button"
          className="inline cursor-pointer border-0 bg-transparent p-0 text-[var(--sat-accent-primary)] underline decoration-[color-mix(in_srgb,var(--sat-accent-primary)_35%,transparent)] underline-offset-2 hover:decoration-[var(--sat-accent-primary)]"
          onClick={() => onWikiLink(name)}
        >
          {wiki[2]?.trim() || name}
        </button>
      );
    }
    if (part.startsWith("==") && part.endsWith("==")) {
      return (
        <mark
          key={`highlight-${index}`}
          className="rounded-sm bg-[color-mix(in_srgb,var(--sat-accent-primary)_22%,transparent)] px-0.5 text-inherit"
        >
          {part.slice(2, -2)}
        </mark>
      );
    }
    return <span key={`text-${index}`}>{part}</span>;
  });
}

function childNodes(node: SyntaxNode) {
  const children: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function blockChildren(node: SyntaxNode) {
  return childNodes(node).filter(
    (child) => !/^(ListMark|QuoteMark|LinkMark|EmphasisMark|CodeMark)$/.test(child.name),
  );
}

function renderInline(
  node: SyntaxNode,
  source: string,
  onWikiLink: (name: string) => void,
  keyPrefix: string,
) {
  const children = childNodes(node);
  const rendered: React.ReactNode[] = [];
  let cursor = node.from;

  for (const child of children) {
    if (child.from > cursor) {
      rendered.push(
        ...textParts(source.slice(cursor, child.from), onWikiLink),
      );
    }
    if (!/^(HeaderMark|EmphasisMark|LinkMark|CodeMark)$/.test(child.name)) {
      rendered.push(
        renderInlineNode(child, source, onWikiLink, `${keyPrefix}-${child.from}`),
      );
    }
    cursor = child.to;
  }
  if (cursor < node.to) {
    rendered.push(...textParts(source.slice(cursor, node.to), onWikiLink));
  }
  return rendered.map((child, index) => (
    <span key={`${keyPrefix}-${index}`}>{child}</span>
  ));
}

function renderInlineNode(
  node: SyntaxNode,
  source: string,
  onWikiLink: (name: string) => void,
  key: string,
): React.ReactNode {
  switch (node.name) {
    case "StrongEmphasis":
      return <strong key={key}>{renderInline(node, source, onWikiLink, key)}</strong>;
    case "Emphasis":
      return <em key={key}>{renderInline(node, source, onWikiLink, key)}</em>;
    case "Strikethrough":
      return <del key={key}>{renderInline(node, source, onWikiLink, key)}</del>;
    case "InlineCode":
      return <code key={key}>{source.slice(node.from, node.to).replace(/^`+|`+$/g, "")}</code>;
    case "Link": {
      const raw = source.slice(node.from, node.to);
      if (/^\[[ xX]\]$/.test(raw)) {
        return (
          <input
            key={key}
            type="checkbox"
            checked={raw.toLowerCase() === "[x]"}
            readOnly
            aria-label="Task item"
          />
        );
      }
      const match = raw.match(/^\[([^\]]*)\]\(([^\s)]+)(?:\s+[^)]*)?\)$/);
      const href = safeHref(match?.[2] ?? "");
      const label = match?.[1] ?? raw;
      if (!href) return <span key={key}>{textParts(label, onWikiLink)}</span>;
      return (
        <a
          key={key}
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noreferrer" : undefined}
          className="text-[var(--sat-accent-primary)] underline decoration-[color-mix(in_srgb,var(--sat-accent-primary)_35%,transparent)] underline-offset-2 hover:decoration-[var(--sat-accent-primary)]"
          onClick={(event) => {
            if (href.startsWith("#")) event.preventDefault();
          }}
        >
          {textParts(label, onWikiLink)}
        </a>
      );
    }
    default:
      return <span key={key}>{renderInline(node, source, onWikiLink, key)}</span>;
  }
}

function renderBlock(
  node: SyntaxNode,
  source: string,
  onWikiLink: (name: string) => void,
  key: string,
): React.ReactNode {
  const inline = () => renderInline(node, source, onWikiLink, key);
  if (/^ATXHeading[1-6]$/.test(node.name) || /^SetextHeading[1-2]$/.test(node.name)) {
    const level = Number(node.name.match(/\d+/)?.[0] ?? 1);
    const Heading = `h${level}` as ElementType;
    return <Heading key={key}>{inline()}</Heading>;
  }
  if (node.name === "Paragraph") {
    const raw = source.slice(node.from, node.to);
    const lines = raw.split("\n").map((line) => line.trim());
    if (lines.length >= 2 && lines.every((line) => line.startsWith("|"))) {
      const rows = lines
        .filter((line) => !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line))
        .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
      const [head, ...body] = rows;
      if (head?.length) {
        return (
          <table key={key}>
            <thead><tr>{head.map((cell, index) => <th key={`${key}-h-${index}`}>{textParts(cell, onWikiLink)}</th>)}</tr></thead>
            <tbody>{body.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{row.map((cell, index) => <td key={`${key}-${rowIndex}-${index}`}>{textParts(cell, onWikiLink)}</td>)}</tr>)}</tbody>
          </table>
        );
      }
    }
    return <p key={key}>{inline()}</p>;
  }
  if (node.name === "BulletList" || node.name === "OrderedList") {
    const List = node.name === "BulletList" ? "ul" : "ol";
    return <List key={key}>{blockChildren(node).map((child) => renderBlock(child, source, onWikiLink, `${key}-${child.from}`))}</List>;
  }
  if (node.name === "ListItem") {
    return <li key={key}>{blockChildren(node).map((child) => renderBlock(child, source, onWikiLink, `${key}-${child.from}`))}</li>;
  }
  if (node.name === "Blockquote") {
    const raw = source.slice(node.from, node.to);
    const callout = raw.match(/^>\s*\[!([^\]]+)\]\s*(.*)$/s);
    if (callout) {
      const body = callout[2].replace(/^>\s?/gm, "");
      return (
        <aside key={key} className="markdown-reading-callout">
          <strong>{callout[1]}</strong>
          <p>{textParts(body, onWikiLink)}</p>
        </aside>
      );
    }
    return <blockquote key={key}>{blockChildren(node).map((child) => renderBlock(child, source, onWikiLink, `${key}-${child.from}`))}</blockquote>;
  }
  if (node.name === "FencedCode") {
    const info = childNodes(node).find((child) => child.name === "CodeInfo");
    const code = childNodes(node).find((child) => child.name === "CodeText");
    return (
      <pre key={key}>
        <code data-language={info ? source.slice(info.from, info.to) : undefined}>
          {code ? source.slice(code.from, code.to) : ""}
        </code>
      </pre>
    );
  }
  if (node.name === "HorizontalRule") return <hr key={key} />;
  return <div key={key}>{inline()}</div>;
}

function renderDocument(
  tree: Tree,
  source: string,
  onWikiLink: (name: string) => void,
) {
  return childNodes(tree.topNode).map((node) =>
    renderBlock(node, source, onWikiLink, `block-${node.from}`),
  );
}

export function ReadingView({ markdown, sourcePath, title, services, initialScrollRatio = 0, onScrollRatioChange }: ReadingViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => maskFrontmatter(markdown), [markdown]);
  const parseSource = useMemo(() => maskReadingOnlySyntax(parsed.masked), [parsed.masked]);
  const tree = useMemo(() => parser.parse(parseSource), [parseSource]);
  const rendered = useMemo(
    () =>
      renderDocument(tree, parsed.masked, (name) => {
        const target = services.findNote(name) ?? services.findNote(`${name}.md`);
        if (target) services.openNote(target.path);
      }),
    [parsed.masked, services, tree],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const restore = () => {
      const range = element.scrollHeight - element.clientHeight;
      element.scrollTop = range > 0 ? initialScrollRatio * range : 0;
    };
    restore();
    const handleScroll = () => {
      const range = element.scrollHeight - element.clientHeight;
      onScrollRatioChange?.(range > 0 ? element.scrollTop / range : 0);
    };
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [initialScrollRatio, onScrollRatioChange, rendered]);

  return (
    <div ref={scrollRef} className="markdown-reading-view flex min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--sat-layout-divider)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--sat-layout-divider)]">
      <article
        data-source-path={sourcePath}
        className="markdown-reading-sizer mx-auto w-full max-w-[var(--sat-editor-readable-width,70ch)] px-6 py-10 text-[var(--sat-text-primary)]"
      >
        <h1 className="markdown-reading-title">{title.replace(/\.md$/i, "")}</h1>
        {parsed.entries.length > 0 && (
          <section className="markdown-reading-properties" aria-label="Properties">
            <h2>Properties</h2>
            {parsed.entries.map(([key, value]) => (
              <div className="markdown-reading-property" key={key}>
                <span>{key}</span><strong>{value || "Empty"}</strong>
              </div>
            ))}
          </section>
        )}
        {rendered}
      </article>
    </div>
  );
}
