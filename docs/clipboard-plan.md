# Clipboard Service Architecture — Implementation Plan

> Modeled after VS Code's `IClipboardService` + paste-provider pipeline.
> References: `docs/clipboard-research.md`, `CONVENTIONS.md`, `AGENTS.md`.

---

## Current State (verified in code)

| Surface | Current impl | What's missing |
|---------|--------------|----------------|
| **Editor image paste** | `pasteImageExtension` CM6 → `onPasteImage` → Rust `save_attachment` | ✅ works; but `editor:paste` command uses `navigator.clipboard.readText()` only |
| **Editor paste command** | `editorCommands.tsx:editor:paste` → `navigator.clipboard.readText()` | No image/file/HTML support; no native fallback; not atomic |
| **Canvas paste** | `// TODO: paste from clipboard` stub in `CanvasContextMenu.tsx` | Nothing |
| **File tree cut/paste** | `useVaultClipboard` React state | Dies on restart; no copy-as-path |
| **ViewHeader copy-as** | `navigator.clipboard?.writeText(relativePath)` | Only relative path; no wikilink/markdown submenu |
| **Rust save** | `save_attachment` — 4 org modes, dedup, infer | ✅ Ready; `by_note`/`flat`/`by_type`/`by_date` |
| **Settings** | `filesLinks.ts` — attachmentFolder, attachmentOrganization | Missing: attachmentNaming modes, `same-folder` location mode |

**`@tauri-apps/plugin-clipboard-manager` is NOT installed** — must add.

---

## Architecture: VS Code's Three Layers, Mapped to Basalt

```
Layer 1: ClipboardService (OS + in-memory typed)
   shared/clipboardService.ts
   └ readText / writeText → Tauri plugin or navigator.clipboard
   └ readImage / writeImage → Tauri plugin or navigator.clipboard.read()
   └ writeTyped<T> / readTyped<T> → in-memory Map with hash invalidation

Layer 2: Paste pipeline (MIME-type dispatch)
   packages/editor/src/input/paste-extension.ts  (expanded from paste-image.ts)
   features/canvas/hooks/useCanvasPaste.ts       (canvas-specific)
   └ on paste event → read all MIME types → dispatch to appropriate handler
   └ image/* → save_attachment → insert ![[relPath]]
   └ text/html → turndown → insert markdown
   └ text/uri-list → file path → save + embed OR URL → [[url]]
   └ text/plain → insert as-is

Layer 3: Feature-specific copy/paste handlers
   features/vault/  → file tree cut/copy (with Copy As submenu)
   shared/commands/editorCommands.tsx → editor cut/copy/paste commands
   features/canvas/ → canvas node copy/paste
```

---

## Phase 1: `ClipboardService` Core + Tauri Plugin

**Goal:** single clipboard abstraction with OS read/write + internal typed slots.

### 1.1 Install `@tauri-apps/plugin-clipboard-manager`

```bash
# Frontend
bun add @tauri-apps/plugin-clipboard-manager

# Rust
cd apps/tauri/src-tauri
cargo add tauri-plugin-clipboard-manager
```

Register in `lib.rs`:
```rust
app.plugin(tauri_plugin_clipboard_manager::init())?;
```

### 1.2 Create `shared/clipboardService.ts`

```typescript
/**
 * ClipboardService — platform-level clipboard abstraction.
 *
 * Three concerns:
 * 1. OS clipboard read/write (system clipboard, survives restart)
 * 2. Internal typed clipboard (in-memory, session-only, for vault cut,
 *    canvas node snapshots, etc.)
 * 3. MIME-aware read (for paste pipeline: read all available types)
 */
export interface ClipboardService {
  // --- System clipboard (OS-level, persists across restarts) ---
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  readImage(): Promise<Uint8Array | null>;
  writeImage(data: Uint8Array): Promise<void>;

  // --- Internal typed clipboard (in-memory, session-only) ---
  writeTyped(key: string, data: unknown): void;
  readTyped<T = unknown>(key: string): T | null;
  hasTyped(key: string): boolean;
  clearTyped(key: string): void;
  clearAllTyped(): void;
}
```

Internal typed keys (registered constants):
```typescript
export const CLIPBOARD_KEYS = {
  VAULT_FILES: "vault:files",         // { operation: "cut"|"copy", paths: string[] }
  CANVAS_NODES: "canvas:nodes",       // { snapshot: CanvasNodeSnapshot[], offset: {x,y} }
  EDITOR_SELECTION: "editor:selection", // { text: string, format: "plain"|"html"|"wikilink" }
} as const;
```

Hash invalidation: on every `writeText()` to OS clipboard, store the
text hash. On `readTyped()`, re-read OS text and compare hash — if
different, the internal typed state is stale (user copied something
outside the app), so `clearAllTyped()`. This mirrors VS Code's
`BrowserClipboardService.computeResourcesStateHash()` pattern.

### 1.3 Where it lives

`shared/clipboardService.ts` — this is cross-feature infrastructure
(imported by vault, editor, canvas, shell) so it lives in `shared/`.

Export from `shared/index.ts`:
```typescript
export { clipboardService, CLIPBOARD_KEYS } from "./clipboardService";
```

---

## Phase 2: Editor Paste Pipeline (Rich Paste)

**Goal:** single CM6 extension that handles images, files, HTML, URLs,
and plain text — all in one undo step.

### 2.1 Expand `packages/editor/src/input/paste-image.ts` → `paste-extension.ts`

Rename and expand. The extension reads `ClipboardEvent.clipboardData`
for all MIME types and dispatches:

```
Paste Event
  │
  ├─ Has image/* items?
  │   → call onPasteImage(data, filename)
  │   → returns relPath → insert `![[relPath]]`
  │   → single undo step
  │
  ├─ Has text/html items AND is "Paste As" request?
  │   → call onPasteHtml(html) → insert converted markdown
  │   → yields to plain text by default (smart paste)
  │
  ├─ Has text/uri-list items (files from OS)?
  │   → call onPasteFile(uri, isLocal)
  │   → if local file: save to vault → insert ![[relPath]]
  │   → if URL: insert [[url]] or [text](url) based on selection
  │
  └─ text/plain
      → insert as-is (default CM6 behavior)
```

Each handler is a callback, keeping `packages/editor/` pure (no Tauri).

### 2.2 Update `EditorController` NoteIO interface

Add to `NoteIO`:
```typescript
onPasteHtml?: (html: string) => Promise<string | null>;  // → markdown
onPasteFile?: (uri: string, filename: string) => Promise<string | null>;
```

These are wired in `useNoteIO` via Tauri IPC or TS logic.

### 2.3 Update `editorCommands.tsx` paste command

```typescript
// BEFORE: text-only browser read
navigator.clipboard.readText().then(text => { ... })

// AFTER: route through clipboardService
callback: async () => {
  const view = getActiveView();
  if (!view) return;
  // CM6's built-in paste handler handles the rich paste pipeline
  document.execCommand("paste");
}
```

### 2.4 Atomic undo

Use CM6's `StateEffect` to group the file-save and text-insert into
one undo. The existing `onPasteImage` callback already works this
way — the `dispatch` in `paste-image.ts` uses the default undo
history. Ensure the new handlers follow the same pattern.

---

## Phase 3: Canvas Paste

**Goal:** canvas intercepts paste events and creates appropriate nodes.

### 3.1 Create `features/canvas/hooks/useCanvasPaste.ts`

```typescript
/**
 * Canvas paste handler. Reads clipboard content and creates canvas nodes.
 * Image → image node (file saved to vault attachment folder).
 * File → file node (saved to vault).
 * URL → URL node.
 * Text → text card.
 * Internal canvas copy → duplicate nodes at offset.
 */
export function useCanvasPaste(options: {
  addNode: (node: CanvasNode) => void;
  onPasteImage: (data: Uint8Array, filename: string) => Promise<string | null>;
}) { ... }
```

### 3.2 Wire into canvas

In `useCanvasState.ts`, add a `paste` event listener on the ReactFlow
container (or on the canvas `div`). On paste:
1. Check `clipboardService.readTyped(CLIPBOARD_KEYS.CANVAS_NODES)` —
   if present, duplicate nodes at an offset.
2. Otherwise, read system clipboard via `clipboardService.readImage()` or
   `navigator.clipboard` and dispatch to `useCanvasPaste`.

### 3.3 Canvas context menu paste

In `CanvasContextMenu.tsx`, replace the `// TODO: paste from clipboard`
stub with:
```typescript
<ContextMenuItem onClick={() => { onPaste(); onClose(); }}>
  <IconClipboard size={15} stroke={1.5} /> Paste
</ContextMenuItem>
```

---

## Phase 4: File Tree Clipboard (Cut/Copy/Copy As)

**Goal:** replace in-memory React state with `ClipboardService` typed
storage; add rich copy-as options.

### 4.1 Replace `useVaultClipboard.ts`

The current `useVaultClipboardState()` returns a React hook. Replace
with direct `clipboardService` usage:

```typescript
// BEFORE
const clipboard = useVaultClipboardState();
clipboard.setCutItems(items);

// AFTER
clipboardService.writeTyped(CLIPBOARD_KEYS.VAULT_FILES, {
  operation: "cut",
  paths: items.map(i => i.path),
});
```

The `useVaultController` reads from `clipboardService.readTyped()`
instead of local state. A thin `useVaultClipboard()` hook can wrap
this with `useSyncExternalStore` or zustand for reactive updates.

### 4.2 Cut flow (unchanged conceptually)

- `Ctrl+X` on selected files → `clipboardService.writeTyped(VAULT_FILES, { operation: "cut", paths })`
  + `clipboardService.writeText(relativePath)` to system clipboard (for external use)
- `Ctrl+V` anywhere → read typed → if `operation === "cut"`, call `invoke("move_file", { from, to })` for each path, then `clipboardService.clearTyped(VAULT_FILES)`
- On restart: `clearAllTyped()` in `Boot.tsx`

### 4.3 Copy As submenu

Add `Copy As` submenu to the vault context menu:
```typescript
[
  { label: "Wikilink", action: () => writeText(`[[${stem}]]`) },
  { label: "Markdown link", action: () => writeText(`[${stem}](${relPath})`) },
  { label: "Relative path", action: () => writeText(relPath) },
  { label: "Absolute path", action: () => writeText(absPath) },
  { label: "File URL", action: () => writeText(`file://${absPath}`) },
]
```

These all write to the **system clipboard** (survives restart, works
in other apps).

### 4.4 `Ctrl+C` in file tree

Per Obsidian convention: `Ctrl+C` copies **relative path** to system
clipboard (not duplicate file). `Ctrl+Shift+C` copies absolute path.

---

## Phase 5: Settings + Paste Mode

**Goal:** add clipboard-related settings, including paste behavior mode.

### 5.1 Add settings to `filesLinks.ts`

```typescript
{
  key: "defaultPasteMode",
  name: "Default paste mode",
  description: "How content is pasted into the editor.",
  type: "dropdown",
  options: [
    { label: "Smart (auto-detect)", value: "smart" },
    { label: "Keep formatting", value: "keep" },
    { label: "Plain text only", value: "plain" },
  ],
},
{
  key: "pasteUrlAsLink",
  name: "Paste URL to create link",
  description: "When pasting a URL over selected text, create a markdown link.",
  type: "dropdown",
  options: [
    { label: "Smart (auto-detect)", value: "smart" },
    { label: "Always", value: "always" },
    { label: "Never", value: "never" },
  ],
},
```

### 5.2 Add missing Rust attachment location modes

Currently: `flat`, `by_note`, `by_type`, `by_date`.
Add: `same_folder` (save next to current note) and `subfolder`
(save in `{note_folder}/{subfolder}/`).

Wire from settings → Rust `save_attachment` via config.

---

## Phase 6: Smart Paste (URL → Markdown Link)

**Goal:** when user pastes a URL while text is selected, auto-wrap
as `[[url]]` or `[selected](url)`.

### 6.1 Implementation in paste pipeline

In the CM6 paste extension:
1. On `text/plain` paste, check if the pasted text is a URL
   (`/^https?:\/\//`)
2. Check if there's a selection (`view.state.selection.main.from !== to`)
3. If both: read `newLinkFormat` setting (`wikilink` vs `markdown`)
4. Insert `[[pasted-url]]` or `[selected-text](pasted-url)`
5. This is controlled by the `pasteUrlAsLink` setting

### 6.2 Smart paste detection (Obsidian-style)

Per `CONVENTIONS.md` — keep it simple:
- If selection is already a link → don't double-wrap
- If cursor is inside code block → paste plain
- If selection is multi-line → paste plain

---

## File Budget Check

| File | Location | Lines (est.) | Constraint |
|------|----------|-------------|------------|
| `clipboardService.ts` | `shared/` | ~150 | Not in a feature → no file budget |
| `paste-extension.ts` | `packages/editor/src/input/` | ~120 | Replaces `paste-image.ts` |
| `useCanvasPaste.ts` | `features/canvas/hooks/` | ~100 | Canvas feature hook #6 (budget: 4) ⚠️ |
| `useVaultClipboard.ts` | `features/vault/hooks/` | ~80 | Rewrite of existing (same count) |
| `editorCommands.tsx` | `shared/commands/` | +10 | Existing file, small delta |

⚠️ Canvas hooks budget: canvas already has 6 hooks (existing debt over
the 4-hook budget). Adding a 7th would make it worse. **Mitigation:**
merge paste logic directly into `useCanvasKeyboard.ts` (paste IS a
keyboard event — Ctrl+V). The handler reads from `clipboardService`
and calls `addNode` / `onPasteImage` passed via options. No new file.

---

## Implementation Order

| Phase | Depends on | Gate |
|-------|-----------|------|
| **Phase 1**: ClipboardService + Tauri plugin | Nothing | `tsc` clean, `bun run lint` clean, manual paste test |
| **Phase 2**: Editor rich paste pipeline | Phase 1 | Image paste works, HTML paste works, URL smart paste works, single undo |
| **Phase 3**: Canvas paste | Phase 1 | Image → image node, text → text card, internal copy → duplicate |
| **Phase 4**: File tree cut/copy/Copy As | Phase 1 | Cut/move works, Ctrl+C copies path, Copy As submenu works |
| **Phase 5**: Settings + missing attachment modes | Phase 2 | All 6 attachment location modes work, paste mode setting takes effect |
| **Phase 6**: Smart paste URL → link | Phase 2 | Paste URL over selection → auto-wraps as link |

---

## Verification Checklist

After implementation, test each:

- [ ] Paste image from OS clipboard in editor → `![[image.png]]` inserted, file saved
- [ ] Paste image from OS clipboard in canvas → image node created
- [ ] Paste text in editor → text inserted (no side effects)
- [ ] Paste HTML in editor → converted to markdown (with "Keep formatting" mode)
- [ ] Paste URL over selected text → auto-wrapped as link (smart mode)
- [ ] Paste file from Finder/Explorer in editor → saved to vault + embed inserted
- [ ] `Ctrl+X` files in tree → cut highlight, `Ctrl+V` moves them
- [ ] `Ctrl+C` file in tree → relative path on system clipboard
- [ ] "Copy As → Wikilink" → `[[note]]` on system clipboard
- [ ] Restart app → internal clipboard cleared, system clipboard intact
- [ ] Single undo step for image paste (one `Ctrl+Z` removes both embed and file)
- [ ] All `bun run lint && bunx tsc --noEmit` pass
