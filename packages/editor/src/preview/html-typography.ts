// Typography for rendered raw-HTML blocks. Single shared source: the CM6
// live-preview widget and the Reading view both apply this to a `.sat-html`
// container. Element styles mirror the markdown tokens (--sat-editor-heading*,
// --sat-text-*, --sat-editor-*) so a raw <h1> matches `# h1`. Markdown has no
// default styling — only which element it becomes — so the theme owns these.
//
// `.cm-content` scope covers inline HTML elements rendered natively by the
// browser inside the editor contenteditable (e.g. `<div>`, `<h1>`, `<p>` typed
// directly in the note). Same rules, different container.
export const HTML_TYPOGRAPHY_CSS = `
.sat-html {
  color: var(--sat-text-primary, #e2e8f0);
  font-family: var(--sat-font-sans, Inter, system-ui, sans-serif);
  font-size: 1em;
  line-height: 1.65;
  box-sizing: border-box;
}
.sat-html *,
.sat-html *::before,
.sat-html *::after {
  box-sizing: border-box;
}
.sat-html > :first-child { margin-top: 0; }
.sat-html > :last-child { margin-bottom: 0; }

.sat-html h1, .sat-html h2, .sat-html h3,
.sat-html h4, .sat-html h5, .sat-html h6 {
  font-weight: 700;
  line-height: 1.2;
  color: var(--sat-text-primary, #e2e8f0);
  margin: 1.4em 0 0.55em;
}
.sat-html h1 {
  font-size: 2em;
  font-weight: 700;
  line-height: 1.15;
  color: var(--sat-editor-heading1, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h1-letter-spacing, -0.03em);
}
.sat-html h2 {
  font-size: 1.6em;
  font-weight: 650;
  line-height: 1.2;
  color: var(--sat-editor-heading2, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h2-letter-spacing, -0.02em);
}
.sat-html h3 {
  font-size: 1.37em;
  font-weight: 580;
  line-height: 1.25;
  color: var(--sat-editor-heading3, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h3-letter-spacing, -0.01em);
}
.sat-html h4 {
  font-size: 1.25em;
  font-weight: 520;
  line-height: 1.3;
  color: var(--sat-editor-heading4, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h4-letter-spacing, 0);
}
.sat-html h5 {
  font-size: 1.12em;
  font-weight: 470;
  line-height: 1.35;
  color: var(--sat-editor-heading5, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h5-letter-spacing, 0);
}
.sat-html h6 {
  font-size: 1em;
  font-weight: 430;
  line-height: 1.35;
  color: var(--sat-editor-heading6, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h6-letter-spacing, 0);
}

.sat-html p {
  margin: 0.9em 0;
}
.sat-html strong { font-weight: 700; }
.sat-html em { font-style: italic; }
.sat-html del { text-decoration: line-through; }
.sat-html ins { text-decoration: underline; }
.sat-html mark {
  background-color: color-mix(in srgb, var(--sat-accent-primary, #a78bfa) 25%, transparent);
  color: inherit;
  border-radius: 2px;
  padding: 0 0.1rem;
}
.sat-html sub, .sat-html sup { font-size: 0.75em; }

.sat-html a {
  color: var(--sat-accent-primary, #a78bfa);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--sat-accent-primary, #a78bfa) 35%, transparent);
  text-underline-offset: 2px;
}
.sat-html a:hover { text-decoration-color: var(--sat-accent-primary, #a78bfa); }

.sat-html ul, .sat-html ol {
  margin: 0.9em 0;
  padding-left: 1.6em;
}
.sat-html li { margin: 0.2em 0; }
.sat-html li > ul, .sat-html li > ol { margin: 0.15em 0; }

.sat-html blockquote {
  margin: 0.9em 0;
  padding-left: 1em;
  border-left: 3px solid var(--sat-editor-blockquote-border, var(--sat-accent-primary, #a78bfa));
  color: var(--sat-editor-blockquote-text, var(--sat-text-muted, #94a3b8));
}

.sat-html code {
  background-color: var(--sat-editor-inline-bg, #0b1220);
  border-radius: 4px;
  font-family: var(--sat-font-mono, ui-monospace, monospace);
  font-size: 0.9em;
  padding: 0.12em 0.35em;
}
.sat-html pre {
  margin: 0.9em 0;
  padding: 1em;
  overflow-x: auto;
  background-color: var(--sat-editor-code-bg, #0b1220);
  border-radius: 8px;
  font-family: var(--sat-font-mono, ui-monospace, monospace);
  line-height: 1.5;
}
.sat-html pre code {
  background: transparent;
  padding: 0;
}

.sat-html table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.9em 0;
}
.sat-html th, .sat-html td {
  border: 1px solid var(--sat-layout-divider, rgba(255,255,255,0.1));
  padding: 0.45em 0.65em;
  text-align: left;
}
.sat-html th {
  background-color: color-mix(in srgb, var(--sat-text-primary, #e2e8f0) 6%, transparent);
  font-weight: 600;
}
.sat-html caption { caption-side: bottom; color: var(--sat-text-muted, #94a3b8); padding-top: 0.4em; }

.sat-html img, .sat-html video {
  max-width: 100%;
  border-radius: 6px;
}
.sat-html figure { margin: 0.9em 0; }
.sat-html figcaption { color: var(--sat-text-muted, #94a3b8); font-size: 0.85em; padding-top: 0.3em; }

.sat-html hr {
  border: 0;
  border-top: 1px solid var(--sat-layout-divider, rgba(255,255,255,0.1));
  margin: 1.5em 0;
}
.sat-html details { margin: 0.9em 0; }
.sat-html summary { cursor: pointer; font-weight: 600; }
.sat-html abbr { text-decoration: underline dotted; cursor: help; }

/* .cm-content scope — inline HTML elements rendered by the browser inside the
   editor contenteditable. Same element rules as .sat-html but without the
   container-level resets (box-sizing, first/last-child) which would conflict
   with CM6's own layout. */
.cm-content h1, .cm-content h2, .cm-content h3,
.cm-content h4, .cm-content h5, .cm-content h6 {
  font-weight: 700;
  line-height: 1.2;
  color: var(--sat-text-primary, #e2e8f0);
  margin: 1.4em 0 0.55em;
}
.cm-content h1 {
  font-size: 2em;
  font-weight: 700;
  line-height: 1.15;
  color: var(--sat-editor-heading1, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h1-letter-spacing, -0.03em);
}
.cm-content h2 {
  font-size: 1.6em;
  font-weight: 650;
  line-height: 1.2;
  color: var(--sat-editor-heading2, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h2-letter-spacing, -0.02em);
}
.cm-content h3 {
  font-size: 1.37em;
  font-weight: 580;
  line-height: 1.25;
  color: var(--sat-editor-heading3, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h3-letter-spacing, -0.01em);
}
.cm-content h4 {
  font-size: 1.25em;
  font-weight: 520;
  line-height: 1.3;
  color: var(--sat-editor-heading4, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h4-letter-spacing, 0);
}
.cm-content h5 {
  font-size: 1.12em;
  font-weight: 470;
  line-height: 1.35;
  color: var(--sat-editor-heading5, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h5-letter-spacing, 0);
}
.cm-content h6 {
  font-size: 1em;
  font-weight: 430;
  line-height: 1.35;
  color: var(--sat-editor-heading6, var(--sat-text-primary, #e2e8f0));
  letter-spacing: var(--sat-editor-h6-letter-spacing, 0);
}

.cm-content p {
  margin: 0.9em 0;
}
.cm-content strong { font-weight: 700; }
.cm-content em { font-style: italic; }
.cm-content del { text-decoration: line-through; }
.cm-content ins { text-decoration: underline; }
.cm-content mark {
  background-color: color-mix(in srgb, var(--sat-accent-primary, #a78bfa) 25%, transparent);
  color: inherit;
  border-radius: 2px;
  padding: 0 0.1rem;
}
.cm-content sub, .cm-content sup { font-size: 0.75em; }

.cm-content a {
  color: var(--sat-accent-primary, #a78bfa);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--sat-accent-primary, #a78bfa) 35%, transparent);
  text-underline-offset: 2px;
}
.cm-content a:hover { text-decoration-color: var(--sat-accent-primary, #a78bfa); }

.cm-content ul, .cm-content ol {
  margin: 0.9em 0;
  padding-left: 1.6em;
}
.cm-content li { margin: 0.2em 0; }
.cm-content li > ul, .cm-content li > ol { margin: 0.15em 0; }

.cm-content blockquote {
  margin: 0.9em 0;
  padding-left: 1em;
  border-left: 3px solid var(--sat-editor-blockquote-border, var(--sat-accent-primary, #a78bfa));
  color: var(--sat-editor-blockquote-text, var(--sat-text-muted, #94a3b8));
}

.cm-content code {
  background-color: var(--sat-editor-inline-bg, #0b1220);
  border-radius: 4px;
  font-family: var(--sat-font-mono, ui-monospace, monospace);
  font-size: 0.9em;
  padding: 0.12em 0.35em;
}
.cm-content pre {
  margin: 0.9em 0;
  padding: 1em;
  overflow-x: auto;
  background-color: var(--sat-editor-code-bg, #0b1220);
  border-radius: 8px;
  font-family: var(--sat-font-mono, ui-monospace, monospace);
  line-height: 1.5;
}
.cm-content pre code {
  background: transparent;
  padding: 0;
}

.cm-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.9em 0;
}
.cm-content th, .cm-content td {
  border: 1px solid var(--sat-layout-divider, rgba(255,255,255,0.1));
  padding: 0.45em 0.65em;
  text-align: left;
}
.cm-content th {
  background-color: color-mix(in srgb, var(--sat-text-primary, #e2e8f0) 6%, transparent);
  font-weight: 600;
}
.cm-content caption { caption-side: bottom; color: var(--sat-text-muted, #94a3b8); padding-top: 0.4em; }

.cm-content img, .cm-content video {
  max-width: 100%;
  border-radius: 6px;
}
.cm-content figure { margin: 0.9em 0; }
.cm-content figcaption { color: var(--sat-text-muted, #94a3b8); font-size: 0.85em; padding-top: 0.3em; }

.cm-content hr {
  border: 0;
  border-top: 1px solid var(--sat-layout-divider, rgba(255,255,255,0.1));
  margin: 1.5em 0;
}
.cm-content details { margin: 0.9em 0; }
.cm-content summary { cursor: pointer; font-weight: 600; }
.cm-content abbr { text-decoration: underline dotted; cursor: help; }
`;
