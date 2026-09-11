# Clipboard Architecture Research — Basalt

> Research done 2026-09-11. Sources: Obsidian help docs, VS Code source (Electron clipboard service, markdown paste providers, editor paste pipeline), Obsidian plugin ecosystem docs, Tauri v2 clipboard plugin docs.

---

## 1. How Obsidian Handles Clipboard

Obsidian's clipboard behavior is split across **editor paste** (internal CM-based editor), **canvas paste** (Excalidraw-like canvas), and **vault clipboard** (file tree cut/copy/paste).

### 1.1 Image / Asset Paste (Core Behavior)

When you paste an image into an Obsidian note:

1. **Editor intercepts the paste event** — Electron's clipboard contains `image/png` (or JPEG, etc.) binary.
2. **Saves to the default attachment folder** — configurable under `Settings → Files & Links → Default location for new attachments`:
   - `Vault root` (default)
   - `Specific folder` (e.g., `assets/`)
   - `Same folder as current note`
   - `Subfolder under current note's folder` (e.g., note is `foo/bar.md`, assets go to `foo/assets/`)
3. **Generates a filename** — timestamp-based (`Pasted image 2026-09-11-153022.png`) with duplicate resolution.
4. **Inserts `![[Pasted image ... .png]]`** at the caret — using Obsidian's wikilink embed syntax.
5. **Single undo** — the file save + insert is one atomic undo operation.

For **external file paste** (copying a file from OS Finder/Explorer and pasting into Obsidian):

- Obsidian copies the file to the default attachment location.
- Inserts an `![[filename.ext]]` embed or `[[filename.ext]]` link depending on context.

### 1.2 Text Paste Modes

Obsidian supports multiple paste modes (`Settings → Editor → Default paste mode`):

- **Strict Markdown**: converts HTML to clean Markdown
- **Smart indent**: preserves original formatting (tabs/spaces from source)
- **Keep line breaks**: preserves line breaks
- **Auto-detect**: tries to infer the best mode

Additionally:

- `Ctrl+Shift+V` = paste without formatting (plain text only)
- When pasting a URL while text is selected → "Smart Paste" converts `[selected text](url)` → `[[url]]` depending on context

### 1.3 Canvas Clipboard (Canvas Core Plugin)

Canvas supports:

- **Node copy/paste**: `Ctrl+C` on selected card(s) → in-memory JSON snapshot → `Ctrl+V` creates duplicates at offset position
- **External image paste**: same as editor — saves to attachment folder, creates an image node on canvas
- **File drag-in from OS**: copies file to vault, creates a file node (note, image, or generic file) on canvas
- **Vault note drag**: creates a note node with no file copy (just a reference)
- **Cross-canvas paste**: preserves the JSON node structure, resolves references

### 1.4 Vault File Tree Clipboard (In-Memory Only)

The file tree `Cut`/`Paste` is a **purely in-memory** clipboard:

- `Cut`: highlights cut files in tree (like a native cut)
- `Paste`: `Ctrl+V` → moves files (not copy)
- **Lost on restart** — this is by design in Obsidian; it's a move operation, not a backup
- **Copy in file tree**: Obsidian uses `Ctrl+C` for **copying the relative path** (not duplicating files), consistent with macOS Finder conventions
- `Ctrl+Shift+C` = copy absolute path (for links)

### 1.5 Copy As Features (Obsidian-Specific)

Obsidian has rich **"Copy As"** context-menu items:

- Copy wikilink (`[[Note]]`)
- Copy Markdown link (`[Note](path)`)
- Copy absolute path
- Copy relative path
- Copy file URL (for pasting into other apps)

These write the appropriate format to the **system clipboard** via Electron's native API, so they survive restart and work cross-app.

---

## 2. How VS Code Handles Clipboard

VS Code's architecture is the gold standard for a desktop Markdown workspace clipboard.

### 2.1 `IClipboardService` — Platform-Level Service (Singleton)

```
IClipboardService (interface, DI token)
  ├─ writeText(text, type?)     — type = "selection" | "clipboard" (macOS find pasteboard)
  ├─ readText(type?)
  ├─ writeResources(URI[])      — custom native clipboard format for file lists
  ├─ readResources() → URI[]
  ├─ hasResources() → boolean
  ├─ readImage() → Uint8Array   — binary image data from clipboard
  ├─ triggerPaste(windowId)     — programmatic paste (Electron IPC)
  └─ writeFindText/readFindText — macOS find pasteboard (special native API)
```

**Desktop (Electron) implementation** — `NativeClipboardService`:

- `writeResources`/`readResources`: uses a **custom native clipboard format** (`code/file-list`) via Electron's `clipboard.writeBuffer()`/`clipboard.readBuffer()`. This is **platform-native** — OS can't read it, but other VS Code windows can.
- `readImage()`: via Electron's `clipboard.readImage()` → returns raw PNG bytes
- `triggerPaste()`: sends IPC to main process which synthesizes a paste event
- Text operations: directly Electron `clipboard.writeText()` / `clipboard.readText()`
- Supports `type` parameter to separate clipboard from selection/find pasteboard (macOS-specific)

**Browser fallback** — `BrowserClipboardService`:

- `writeResources`: stores URIs in a custom MIME (`application/vnd.code.resources`) on `navigator.clipboard.write()`, **plus** keeps an in-memory copy with a **hash-based invalidation** strategy (listens for `copy` events on `document` and resets the in-memory cache when text hash changes)
- `readImage()`: reads from `navigator.clipboard.read()` checking `image/png|jpeg|gif|tiff|bmp`
- Safari-specific workaround: pre-loads a `ClipboardItem` promise on user gestures to work around Safari's async clipboard restriction

### 2.2 Paste Pipeline (Editor)

The editor's paste system has three layers:

**Layer 1: `CopyPasteController` (editor contribution)**

- On paste: reads `DataTransfer` (all MIME types) from the native paste event
- Writes a `application/vnd.code.copymetadata` MIME to track copy source (so paste can reference the same provider)
- Queries all registered `DocumentPasteEditProvider`s that claim any of the MIME types
- Collects `DocumentPasteEdit` candidates, shows a "Paste As..." widget (`PostEditWidgetManager`) if multiple options
- Applies the chosen edit

**Layer 2: Default Providers (`DefaultTextPasteOrDropEditProvider`, etc.)**

- `text/plain`: insert as plain text
- `text/uri-list`: insert as URI path (absolute or relative)
- `text/html`: insert as HTML (only on explicit "Paste As HTML")

**Layer 3: Markdown Extension (`ResourcePasteOrDropProvider`)**

- Registered for `text/uri-list`, `files`, `image/*`, `audio/*`, `video/*`
- On media paste: creates a `NewFilePathGenerator` → saves file to `markdown.images.path` workspace setting → returns a `WorkspaceEdit` that both creates the file and inserts `![alt](relative/path)` at caret
- Supports multiple files in one paste
- Distinguishes "paste into workspace" (file already in workspace → just insert link) vs "paste from outside" (copy file → insert link)

### 2.3 Key VS Code Clipboard Patterns

| Pattern                  | Description                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Typed clipboard**      | `writeText(text, type)` allows in-memory "slots" alongside system clipboard (e.g., for copy metadata between editor groups) |
| **Custom native format** | `writeBuffer(format, buffer)` for file lists — invisible to other apps, survives within-app cross-window paste              |
| **Paste-as provider**    | Extensible: any language can register paste transforms; UI shows a picker when multiple providers match                     |
| **Hash invalidation**    | Browser: tracks clipboard text hash to know when in-memory resource cache is stale                                          |
| **Atomic file paste**    | `WorkspaceEdit.createFile()` + insert — one undo step for save + link insertion                                             |

---

## 3. Obsidian UX/UI Feature Inventory (Parity Gaps)

Based on the Obsidian help docs, these are UX features Basalt should address:

### Core Editor Features

| Feature                              | Obsidian | Basalt                  | Notes                                           |
| ------------------------------------ | -------- | ----------------------- | ----------------------------------------------- |
| Paste image → save to vault + embed  | ✅       | ⚠️ partial              | Only works in editor, not canvas                |
| Paste file from OS → save + embed    | ✅       | ❌                      | Not implemented                                 |
| Smart paste (URL → markdown link)    | ✅       | ❌                      | Paste URL on selected text → auto-wrap          |
| Paste without formatting             | ✅       | ⚠️ native only          | No Markdown conversion layer                    |
| Copy As (wikilink/markdown/path/url) | ✅       | ⚠️ partial              | ViewHeader has copy-as-link                     |
| Quick switcher (fuzzy note switcher) | ✅       | ✅                      | Done                                            |
| Command palette                      | ✅       | ✅                      | Done                                            |
| Backlinks panel                      | ✅       | ✅                      | Done                                            |
| Outline panel                        | ✅       | ✅ (headers)            | Using CM headings                               |
| Tags panel + tag: search             | ✅       | ✅                      | Done                                            |
| Properties view                      | ✅       | ✅ (frontmatter)        | Done                                            |
| Graph view                           | ✅       | ✅                      | Done                                            |
| Daily notes                          | ✅       | ✅                      | Done (ADR-036)                                  |
| Templates                            | ✅       | ✅                      | Done (ADR-036)                                  |
| Bookmarks                            | ✅       | ❌                      | Not started                                     |
| Workspaces (save/restore layouts)    | ✅       | ❌                      | ADR-032 layout is saved but no named workspaces |
| Audio recorder                       | ✅       | ❌                      | Not started                                     |
| Slides / presentation mode           | ✅       | ❌                      | Not started                                     |
| Note composer (merge/split)          | ✅       | ❌                      | Not started                                     |
| Format converter                     | ✅       | ❌                      | Not started                                     |
| Word count                           | ✅       | ⚠️                      | StatusBar only                                  |
| Page preview (hover preview)         | ✅       | ❌                      | Not started                                     |
| Web viewer (embedded browser)        | ✅       | ❌                      | Not started                                     |
| File recovery                        | ✅       | ❌                      | Not started                                     |
| Unique note creator                  | ✅       | ✅ (via quick switcher) | Quick switcher creates on Enter                 |

### Canvas-Specific Features

| Feature                         | Obsidian | Basalt         | Notes                                                |
| ------------------------------- | -------- | -------------- | ---------------------------------------------------- |
| Copy/paste nodes (in-memory)    | ✅       | ❌             | Canvas context menu has `// TODO: paste`             |
| Paste image from clipboard      | ✅       | ❌             | Canvas doesn't intercept image paste                 |
| External file drag → vault copy | ✅       | ⚠️ editor only | File tree DnD inserts wikilink, not canvas file node |
| Group selection                 | ✅       | ✅             | Done                                                 |
| Embed nodes (note, image, web)  | ✅       | ⚠️             | Basic file nodes only                                |

### File Tree Features

| Feature                 | Obsidian | Basalt | Notes                   |
| ----------------------- | -------- | ------ | ----------------------- |
| Cut / paste (move file) | ✅       | ✅     | In-memory clipboard     |
| Copy relative path      | ✅       | ⚠️     | `ViewHeader` copy link  |
| Copy absolute path      | ✅       | ⚠️     | Not explicitly separate |
| Rename (inline)         | ✅       | ✅     | Done (ADR-023)          |
| New folder              | ✅       | ✅     | Done                    |
| Sort by name/date       | ✅       | ⚠️     | Default sort only       |

---

## 4. Recommended Clipboard Architecture for Basalt

### 4.1 Core Principle: One `ClipboardService` at the Shell Layer

Following VS Code's architecture and ADR-018 (registry-driven workbench), Basalt should have a **single `ClipboardService`** registered in the shell/registry layer, consumed by all features:

```
packages/commands/         (or a shared registry module)
  └── ClipboardService     (Tauri IPC + system clipboard)

apps/tauri/src/
  ├── shared/              (cross-feature wiring)
  │   └── clipboardCommands.ts  (Ctrl+C/X/V global handlers)
  ├── features/editor/     (paste handlers, paste-as providers)
  ├── features/canvas/     (paste handlers for canvas nodes)
  └── features/vault/      (file tree cut/copy/paste)
```

### 4.2 `ClipboardService` Interface

```typescript
interface ClipboardService {
  // --- System clipboard operations (Tauri plugin) ---
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  readImage(): Promise<Uint8Array | null>; // PNG bytes
  writeImage(data: Uint8Array): Promise<void>;

  // --- Internal typed clipboard (in-memory, survives within session) ---
  writeTyped<T>(key: string, data: T): void;
  readTyped<T>(key: string): T | null;
  clearTyped(key: string): void;

  // --- File clipboard (vault-internal move/copy) ---
  writeFiles(operation: "cut" | "copy", paths: string[]): void;
  readFiles(): { operation: "cut" | "copy"; paths: string[] } | null;
  clearFiles(): void;
  hasFiles(): boolean;
}
```

**Typed clipboard keys** (internal, in-memory, cleared on restart):

- `vault:files` — file tree cut/copy
- `canvas:nodes` — canvas node copy/paste (JSON snapshots)
- `editor:selection` — editor selection for cross-pane paste

### 4.3 Paste Pipeline (Editor)

Intercept at the CM6 `domEventHandlers({ paste })` level (extend current `paste-image.ts`):

```
Paste Event
  │
  ├─ Has image/* items?        → saveToAttachmentFolder(data) → insert ![[relPath]]
  ├─ Has text/html items?      → smartPaste(html) → convert to Markdown → insert
  ├─ Has text/uri-list items?  → isFilePath? → saveToVault + embed
  │                            → isURL? → insert [[url]] or [text](url) depending on selection
  └─ Has text/plain items?     → insert as-is (plain text)
```

All operations should produce a **single undo step** (CM6 `state.update({ annotations: [TransactionSpec] })` with a custom annotation).

### 4.4 Paste Pipeline (Canvas)

Canvas paste events (from `@xyflow/react` or native):

```
Paste Event (canvas focused)
  │
  ├─ Has image/* items?    → saveToAttachmentFolder(data) → createImageNode(relPath, wx, wy)
  ├─ Has text/uri-list?    → createFileNode(uri, wx, wy) or createUrlNode(url, wx, wy)
  ├─ Has text/html?        → createTextCard(extractText(html), wx, wy)
  └─ Internal canvas copy? → createDuplicateNodes(snapshot, offset)
```

### 4.5 File Tree Cut/Paste

- `Ctrl+X` on selected files → `clipboardService.writeFiles("cut", paths)`
- `Ctrl+C` on selected files → `clipboardService.writeFiles("copy", paths)` AND/OR `writeText(relativePath)` to system clipboard
- `Ctrl+V` anywhere → if `clipboardService.hasFiles()`:
  - `cut`: move files via Rust IPC, clear clipboard
  - `copy`: duplicate files via Rust IPC, clear clipboard
- **On restart**: internal clipboard is cleared (Obsidian behavior)

### 4.6 Attachment Folder Logic

Centralize in a `resolveAttachmentFolder(notePath)` utility (Rust or TS):

```
Settings:
  attachmentLocation: "vault-root" | "specified" | "same-folder" | "subfolder"
  attachmentFolderPath?: string    // used when "specified"
  attachmentSubfolder?: string     // used when "subfolder"
  attachmentNaming: "timestamp" | "note-title" | "original"
```

Rust side: `save_asset(data: Vec<u8>, filename: String, note_path: String) -> Result<String>` (already partially exists in `commands/assets/save.rs`).

### 4.7 Settings (Aligned with Obsidian)

Under `Settings → Files & Links`:

| Setting                     | Options                                                         | Default       |
| --------------------------- | --------------------------------------------------------------- | ------------- |
| Default attachment location | Vault root / Specified folder / Same folder as note / Subfolder | Vault root    |
| New link format             | Relative path / Shortest path / Absolute path                   | Relative path |
| Use wikilinks               | On/Off                                                          | On            |
| Default paste mode          | Smart / Keep formatting / Plain text                            | Smart         |
| Paste URL to create link    | Always / Smart / Never                                          | Smart         |

---

## 5. Implementation Phases

### Phase 1: `ClipboardService` + image paste in editor

- Create `ClipboardService` with Tauri `@tauri-apps/plugin-clipboard-manager` + in-memory typed store
- Extend `paste-image.ts` to use the service (already mostly working, just formalize the IPC path)
- Add `resolveAttachmentFolder()` to handle all 4 attachment modes

### Phase 2: Rich text paste + smart paste

- Handle `text/html` → Markdown conversion (turndown or native parser)
- Handle URL paste on selected text → auto-wrap as `[[url]]` or `[text](url)`
- Handle file paste from OS (uri-list MIME) → save to vault + embed

### Phase 3: Canvas clipboard

- Canvas `Copy` writes node JSON snapshots to typed clipboard
- Canvas `Paste` reads snapshots and creates offset duplicates
- Canvas paste from system clipboard (image/file) → same pipeline as editor

### Phase 4: File tree clipboard + Copy As

- Replace current `useVaultClipboard` with `ClipboardService.writeFiles()`
- Add `Copy As` submenu (wikilink, markdown, path, url)
- Handle `Ctrl+C` in file tree to copy relative path to system clipboard

### Phase 5: Settings UI + UX polish

- Add `Files & Links` settings section
- Add "Paste As..." picker (like VS Code's PostEditWidget) for ambiguous pastes
- Handle edge cases (Safari async clipboard, Linux image formats, large file paste)

---

## 6. Tauri Clipboard Plugin Status

Tauri v2 has an official `@tauri-apps/plugin-clipboard-manager`:

- `readText()` / `writeText()` — system clipboard text
- `readImage()` / `writeImage()` — system clipboard images (native PNG)
- No custom MIME types (unlike Electron's `writeBuffer`)
- File list paste detection via the **editor's** `onPaste` event (checking `clipboardData.files`)

For **internal typed clipboard** (resource lists, node snapshots), we need an **in-memory store** alongside the system clipboard — exactly like VS Code's `BrowserClipboardService` pattern.

---

## 7. Reference Implementations

| Reference                                 | What to borrow                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| **VS Code** `IClipboardService`           | Service interface, typed clipboard slots, readImage(), triggerPaste()         |
| **VS Code** `ResourcePasteOrDropProvider` | Paste pipeline with MIME-type dispatch, file save + WorkspaceEdit             |
| **VS Code** `CopyPasteController`         | "Paste As" widget for multiple providers, copy metadata propagation           |
| **VS Code** `NativeClipboardService`      | Custom native format for file lists (Tauri equivalent: in-memory typed store) |
| **Obsidian** attachment settings          | 4-mode attachment folder, wikilink vs markdown link, smart paste URL          |
| **Obsidian** canvas clipboard             | In-memory node snapshots, paste at offset, image → attachment folder          |
