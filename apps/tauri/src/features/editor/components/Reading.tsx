import { parser } from "@lezer/markdown";
import type { SyntaxNode, Tree } from "@lezer/common";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconFileText,
  IconHash,
  IconLink,
  IconList,
  IconNote,
  IconTag,
  type IconProps,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { invoke } from "@tauri-apps/api/core";
import { tokenizeCode, sanitizeHtml, HTML_TYPOGRAPHY_CSS, type CodeToken } from "@workspace/editor";
import type { LeafServices } from "@workspace/views";

// Shared .sat-html typography stylesheet (same source the CM6 widget uses), so
// raw <h1>/<p>/<span> render distinctly and match markdown tokens in Reading.
if (typeof document !== "undefined" && !document.querySelector("[data-sat-html-typography]")) {
  const style = document.createElement("style");
  style.setAttribute("data-sat-html-typography", "");
  style.textContent = HTML_TYPOGRAPHY_CSS;
  document.head.appendChild(style);
}

interface ReadingProps {
  markdown: string;
  sourcePath: string;
  title: string;
  initialScrollRatio?: number;
  onScrollRatioChange?: (ratio: number) => void;
  services: Pick<LeafServices, "openNote" | "findNote">;
}

interface ReadingProperty {
  key: string;
  value: string;
  tags: string[];
}

function parseListValue(value: string): string[] {
  const body = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!body) return [];
  return body
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function maskFrontmatter(source: string): { masked: string; entries: ReadingProperty[] } {
  if (!source.startsWith("---\n")) return { masked: source, entries: [] };
  const end = source.indexOf("\n---", 4);
  if (end < 0) return { masked: source, entries: [] };
  const entries = source
    .slice(4, end)
    .split("\n")
    .map((line) => line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      key: match[1],
      value: match[2],
      tags: match[1].toLowerCase() === "tags" ? parseListValue(match[2]) : [],
    }));
  return {
    masked: source.slice(0, end + 4).replace(/[^\n]/g, " ") + source.slice(end + 4),
    entries,
  };
}

function propertyIcon(key: string, value: string) {
  const normalized = key.toLowerCase();
  let Icon: (props: IconProps) => React.ReactNode = IconNote;
  if (normalized === "title" || normalized === "type") Icon = IconFileText;
  else if (normalized === "created_at" || normalized === "created at") Icon = IconCalendar;
  else if (normalized.includes("updated") || normalized.includes("modified")) Icon = IconClock;
  else if (normalized === "tags") Icon = IconTag;
  else if (normalized === "aliases") Icon = IconLink;
  else if (normalized === "status") Icon = IconCheck;
  else if (value.trim().startsWith("[")) Icon = IconList;
  else if (/^-?\d+(\.\d+)?$/.test(value.trim())) Icon = IconHash;
  return <Icon aria-hidden="true" size={16} stroke={1.7} />;
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
    // Inline HTML tags render as safe, visible raw text in reading mode
    // (container-tag render-reveal is deferred to avoid nesting issues and
    // mXSS risk). This keeps the source visible and fully editable.
    case "HTMLTag":
    case "Comment":
      return <span key={key} className="markdown-reading-html">{source.slice(node.from, node.to)}</span>;
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

const codeTokenCache = new Map<string, CodeToken[]>();

function HighlightedCode({ code, info }: { code: string; info?: string }) {
  const [tokens, setTokens] = useState<CodeToken[] | null>(() => {
    return codeTokenCache.get(`${info ?? ""}\u0000${code}`) ?? null;
  });

  useEffect(() => {
    const key = `${info ?? ""}\u0000${code}`;
    const cached = codeTokenCache.get(key);
    if (cached) {
      setTokens(cached);
      return;
    }
    let cancelled = false;
    void tokenizeCode(code, info).then((result) => {
      if (cancelled) return;
      codeTokenCache.set(key, result);
      setTokens(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, info]);

  let children: React.ReactNode = code;
  if (tokens) {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const token of tokens) {
      if (token.from > cursor) parts.push(code.slice(cursor, token.from));
      if (token.to > token.from) {
        parts.push(
          <span key={`${token.from}-${token.to}`} className={token.classes}>
            {code.slice(token.from, token.to)}
          </span>,
        );
      }
      cursor = token.to;
    }
    if (cursor < code.length) parts.push(code.slice(cursor));
    children = parts;
  }

  return <code data-language={info}>{children}</code>;
}
/** Render a Table node from the Lezer Table extension. */
function renderTableNode(
  node: SyntaxNode,
  source: string,
  onWikiLink: (name: string) => void,
  key: string,
): React.ReactNode {
  const children = childNodes(node);
  const headerCells: string[][] = [];
  const bodyRows: string[][] = [];

  for (const child of children) {
    if (child.name === "TableHeader") {
      for (const cell of childNodes(child)) {
        if (cell.name === "TableCell") {
          headerCells.push([source.slice(cell.from, cell.to)]);
        }
      }
    } else if (child.name === "TableRow") {
      const row: string[] = [];
      for (const cell of childNodes(child)) {
        if (cell.name === "TableCell") {
          row.push(source.slice(cell.from, cell.to));
        }
      }
      bodyRows.push(row);
    }
  }

  if (headerCells.length === 0) return null;

  // Transpose: headerCells is one header row → [[A], [B]], but we want [A, B]
  const header = headerCells.map((c) => c.join(""));

  return (
    <table key={key}>
      <thead>
        <tr>
          {header.map((cell, i) => (
            <th key={`${key}-h-${i}`}>{textParts(cell, onWikiLink)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {bodyRows.map((row, ri) => (
          <tr key={`${key}-r-${ri}`}>
            {row.map((cell, ci) => (
              <td key={`${key}-r-${ri}-${ci}`}>{textParts(cell, onWikiLink)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}


function renderBlock(
  node: SyntaxNode,
  source: string,
  onWikiLink: (name: string) => void,
  key: string,
): React.ReactNode {
  const inline = () => renderInline(node, source, onWikiLink, key);

  // Table nodes — Lezer Table extension produces these for standalone tables
  if (node.name === "Table") {
    return renderTableNode(node, source, onWikiLink, key);
  }

  if (/^ATXHeading[1-6]$/.test(node.name) || /^SetextHeading[1-2]$/.test(node.name)) {
    const level = Number(node.name.match(/\d+/)?.[0] ?? 1);
    const Heading = `h${level}` as ElementType;
    return <Heading key={key}>{inline()}</Heading>;
  }
  if (node.name === "Paragraph") {
    const raw = source.slice(node.from, node.to);
    const lines = raw.split("\n");
    const trimmed = lines.map((line) => line.trim());
    const isDelimiter = (line: string) =>
      /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line);

    // Find a contiguous table run: a |row followed by a delimiter row, then
    // more |rows. Supports tables nested inside list items (paragraphs that
    // mix prose and table lines) plus standalone tables.
    let tableStart = -1;
    let tableEnd = -1;
    for (let i = 0; i < trimmed.length - 1; i++) {
      if (trimmed[i].startsWith("|") && isDelimiter(trimmed[i + 1])) {
        tableStart = i;
        tableEnd = Math.min(i + 1, trimmed.length - 1);
        while (
          tableEnd + 1 < trimmed.length &&
          trimmed[tableEnd + 1].startsWith("|")
        ) {
          tableEnd++;
        }
        break;
      }
    }

    // Whole paragraph is a table → render just the table (fast path, mirrors
    // the previous behavior plus the Table-node path).
    if (tableStart === 0 && tableEnd === trimmed.length - 1) {
      const rows = trimmed
        .filter((line) => !isDelimiter(line))
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

    // Mixed paragraph (prose + nested table) → split into before/table/after.
    if (tableStart >= 0) {
      const tableLines = trimmed.slice(tableStart, tableEnd + 1);
      const rows = tableLines
        .filter((line) => !isDelimiter(line))
        .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
      const [head, ...body] = rows;
      const table = head?.length ? (
        <table key={`${key}-table`}>
          <thead><tr>{head.map((cell, index) => <th key={`${key}-h-${index}`}>{textParts(cell, onWikiLink)}</th>)}</tr></thead>
          <tbody>{body.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{row.map((cell, index) => <td key={`${key}-${rowIndex}-${index}`}>{textParts(cell, onWikiLink)}</td>)}</tr>)}</tbody>
        </table>
      ) : null;

      const before = lines.slice(0, tableStart).join("\n").trim();
      const after = lines.slice(tableEnd + 1).join("\n").trim();
      // Use <div> not <p> — <table> cannot be a descendant of <p> (HTML spec).
      return (
        <div key={key}>
          {before && <span key={`${key}-before`}>{before}&nbsp;</span>}
          {table}
          {after && <span key={`${key}-after`}>&nbsp;{after}</span>}
        </div>
      );
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
  // Fenced (```/~~~) and indented (4-space) code blocks. A block may split
  // into several `CodeText` children (nested in lists/quotes), so code runs
  // from the first to the last of them — never just the first.
  if (node.name === "FencedCode" || node.name === "CodeBlock") {
    const codeTexts = childNodes(node).filter((child) => child.name === "CodeText");
    const info =
      node.name === "FencedCode"
        ? childNodes(node).find((child) => child.name === "CodeInfo")
        : undefined;
    // DQL / dataview code blocks render as live query results in reading mode.
    if (node.name === "FencedCode" && info) {
      const lang = source.slice(info.from, info.to).trim().toLowerCase();
      if (lang in DQL_LANGUAGES) {
        const queryText = source.slice(info.to, node.to).replace(/\s*```\s*$/, "").trim();
        return <DqlQueryBlock key={key} queryText={queryText} onOpenLink={onWikiLink} />;
      }
    }
    const from = codeTexts.length > 0 ? codeTexts[0].from : node.from;
    const to = codeTexts.length > 0 ? codeTexts[codeTexts.length - 1].to : node.to;
    return (
      <pre key={key}>
        <HighlightedCode
          code={source.slice(from, to)}
          info={info ? source.slice(info.from, info.to) : undefined}
        />
      </pre>
    );
  }
  if (node.name === "HorizontalRule") return <hr key={key} />;
  // Render raw HTML blocks sanitized at the single render boundary: the source
  // slice is untrusted, so dangerouslySetInnerHTML is only ever fed the
  // DOMPurify return value and never re-processed. `.sat-html` applies the
  // shared typography so <h1>/<p>/<span> render distinctly, matching markdown.
  if (node.name === "HTMLBlock") {
    const raw = source.slice(node.from, node.to);
    return (
      <div
        key={key}
        className="markdown-reading-html sat-html"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(raw) }}
      />
    );
  }
  return <div key={key}>{inline()}</div>;
}

// ---------------------------------------------------------------------------
// DQL query block — renders ```dql code blocks as live table/list/task views
// in reading mode (matches basalt-tables backend results).
// ---------------------------------------------------------------------------

const DQL_LANGUAGES: Record<string, true> = { dql: true, dataview: true };

function DqlQueryBlock({ queryText, onOpenLink }: { queryText: string; onOpenLink: (name: string) => void }): React.ReactNode {
  const [html, setHtml] = useState<string>('<div class="dql-loading">Loading query…</div>');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<{ columns: Array<{ name: string; type: string }>; rows: Array<Array<{ type: string; [k: string]: unknown }>>; total: number }>("run_query", { dql: queryText, path: "" })
      .then((result) => {
        if (cancelled) return;
        setHtml(renderDqlResultHtml(result));
      })
      .catch((err) => {
        if (cancelled) return;
        setHtml(`<div class="dql-error">Query error: ${String(err)}</div>`);
      });
    return () => { cancelled = true; };
  }, [queryText]);

  // Event delegation: clicks on rendered result links open the target note.
  // Bound via a native listener (not a JSX prop) so the a11y rules for the
  // non-interactive container stay satisfied.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a.internal-link");
      if (!anchor) return;
      event.preventDefault();
      const name = anchor.getAttribute("data-name") ?? anchor.textContent ?? "";
      if (name) onOpenLink(name.trim());
    };
    root.addEventListener("click", handleClick);
    return () => root.removeEventListener("click", handleClick);
  }, [onOpenLink]);

  return <div className="dql-result" ref={rootRef} dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderDqlResultHtml(result: { columns: Array<{ name: string; type: string }>; rows: Array<Array<{ type: string; [k: string]: unknown }>>; total: number }): string {
  const { columns, rows, total } = result;
  if (columns.length === 0 || rows.length === 0) return '<div class="dql-empty">No results</div>';

  // Infer type: list (1 link col), task (link + task), or table
  const isList = columns.length === 1 && columns[0].type === "link" && columns[0].name === "File";
  const isTask = columns.length === 2 && columns[0].type === "link" && columns[1].name === "Task";

  if (isList) {
    const items = rows.map((row) => {
      const cell = row[0];
      if (!cell || cell.type !== "link") return "";
      const path = String(cell.path ?? "");
      const name = String(cell.name ?? path);
      return `<li class="dql-list-item"><a class="internal-link" data-href="${escHtml(path)}">${escHtml(name)}</a></li>`;
    }).join("");
    const footer = total > rows.length ? `<div class="dql-footer">Showing ${rows.length} of ${total}</div>` : "";
    return `<ul class="dql-list">${items}</ul>${footer}`;
  }

  if (isTask) {
    const items = rows.map((row) => {
      const link = row[0];
      const task = row[1];
      const linkHtml = link?.type === "link" ? `<a class="internal-link" data-href="${escHtml(String(link.path ?? ""))}">${escHtml(String(link.name ?? ""))}</a>` : "";
      const taskText = task?.type === "text" ? String(task.value ?? "") : "";
      return `<li class="dql-task-item"><span class="dql-task-link">${linkHtml}</span> <span class="dql-task-text">${escHtml(taskText)}</span></li>`;
    }).join("");
    const footer = total > rows.length ? `<div class="dql-footer">Showing ${rows.length} of ${total}</div>` : "";
    return `<ul class="dql-task-list">${items}</ul>${footer}`;
  }

  // TABLE
  const ths = columns.map((col) => `<th class="dql-th">${escHtml(col.name)}</th>`).join("");
  const trs = rows.map((row) => {
    const tds = row.map((cell) => `<td class="dql-td">${renderCell(cell)}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
  const footer = total > rows.length ? `<div class="dql-footer">Showing ${rows.length} of ${total}</div>` : "";
  return `<table class="dql-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>${footer}`;
}

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderCell(cell: { type: string; [k: string]: unknown }): string {
  switch (cell.type) {
    case "text": return escHtml(String(cell.value ?? ""));
    case "number": return String(cell.value ?? "");
    case "date": return `<span class="dql-date">${escHtml(String(cell.value ?? ""))}</span>`;
    case "checkbox": return cell.value ? '<span class="dql-check on">✓</span>' : '<span class="dql-check off">✗</span>';
    case "link": return `<a class="internal-link dql-link" data-href="${escHtml(String(cell.path ?? ""))}" data-name="${escHtml(String(cell.name ?? ""))}">${escHtml(String(cell.name ?? ""))}</a>`;
    case "null": return '<span class="dql-null">—</span>';
    default: return escHtml(String(cell.value ?? ""));
  }
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

export function Reading({ markdown, sourcePath, title, services, initialScrollRatio = 0, onScrollRatioChange }: ReadingProps) {
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
        className="markdown-reading-sizer mx-auto w-full max-w-[var(--sat-editor-readable-width,70ch)] text-[var(--sat-text-primary)]"
      >
        <h1 className="markdown-reading-title">{title.replace(/\.md$/i, "")}</h1>
        {parsed.entries.length > 0 && (
          <section className="markdown-reading-properties" aria-label="Properties">
            <h2>Properties</h2>
            {parsed.entries.map(({ key, value, tags }) => (
              <div className="markdown-reading-property" key={key}>
                <span className="markdown-reading-property-icon">{propertyIcon(key, value)}</span>
                <span className="markdown-reading-property-key">{key}</span>
                {tags.length > 0 ? (
                  <span className="markdown-reading-property-tags">
                    {tags.map((tag) => <span className="markdown-reading-tag" key={tag}>{tag}</span>)}
                  </span>
                ) : (
                  <strong>{value || "Empty"}</strong>
                )}
              </div>
            ))}
          </section>
        )}
        {rendered}
      </article>
    </div>
  );
}
