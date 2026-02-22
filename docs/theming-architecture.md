# Basalt Theming Architecture

## The Challenge
To build a markdown editor that can support hundreds of custom user-generated themes (similar to Obsidian), we must separate the *logic* of the editor from its *visual presentation*.

## Core Philosophy: Semantic Hooks & CSS Variables

### 1. The Editor Package (`@workspace/editor`)
The `editor` package's primary responsibility is **parsing and semantic tagging**.
- It uses CodeMirror to parse markdown into an Abstract Syntax Tree (AST).
- It injects specific CSS classes (e.g., `.basalt-heading-1`, `.basalt-bold`, `.basalt-task-checkbox`) onto the relevant DOM elements.
- It handles complex logic like hiding markdown markers (e.g., `#` or `**`) when the line is not focused (Live Preview).
- **Crucially:** It does *not* contain specific colors, font sizes, or padding. It only provides the semantic "hooks" (classes).

### 2. The UI Package (`@workspace/ui` or `apps/tauri`)
The global styling layer is responsible for the actual visual rendering.
- It defines design tokens natively using **CSS Variables (Custom Properties)**.
- It maps the semantic classes provided by the editor to these CSS variables.

```css
/* Example definition in the UI package */
:root {
  --basalt-h1-size: 2.5em;
  --basalt-h1-color: #ffffff;
  --basalt-accent-color: #22c55e;
}

/* Mapping the editor hooks to variables */
.cm-live-heading-1 {
  font-size: var(--basalt-h1-size);
  color: var(--basalt-h1-color);
}
```

## How User-Theming Works
When a user installs a custom theme (like "Dracula" or "Cyberpunk"), they are simply loading a `.css` file that overrides the base CSS variables.

```css
/* Example User Theme File */
[data-theme="dracula"] {
  --basalt-h1-color: #ff79c6;       /* Dracula Pink */
  --basalt-accent-color: #bd93f9;   /* Dracula Purple */
}
```

### Benefits of this Architecture
1. **Infinite Customization:** Users can write simple CSS to completely alter the editor's look without needing to understand React or CodeMirror.
2. **Performance:** Changing CSS variables doesn't trigger React renders or deep CodeMirror state updates, ensuring instant theme switching without UI lag.
3. **Separation of Concerns:** Markdown parsing logic remains pristine and untouched by UI design changes.
