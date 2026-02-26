# File Operations — Create, Delete & Folder Commands

> **Goal**: Wire up real file operations so every button and command actually
> mutates the vault. Rust does all I/O; the frontend stays thin.
>
> **Status**: 🟡 Planning complete — ready for implementation
>
> **Date**: 2026-02-26

---

## Table of Contents

1. [Reading Instructions](#reading-instructions)
2. [Current vs Target](#current-vs-target)
3. [Phase 1 — Rust Commands](#phase-1--rust-commands)
4. [Phase 2 — Input Dialog UI Component](#phase-2--input-dialog-ui-component)
5. [Phase 3 — Vault Mutations Hook](#phase-3--vault-mutations-hook)
6. [Phase 4 — Wire to Sidebar & Command Palette](#phase-4--wire-to-sidebar--command-palette)
7. [Phase 5 — File Tree Context Menu](#phase-5--file-tree-context-menu)
8. [Layer Ownership Map](#layer-ownership-map)
9. [Validation Checklist](#validation-checklist)

---

## Reading Instructions

- **Execute phases in order** — each phase builds on the previous one.
- **One phase = one commit** — keep changes atomic and reviewable.
- Each phase lists:
  - ✅ **What** — the deliverable
  - 📁 **Where** — which files/folders are touched
  - 🔧 **How** — specific implementation details
  - ✔️ **Done when** — acceptance criteria
- Follow the [UI Rules](/home/pranav/Projects/Basalt/.agents/workflows/ui-rules.md):
  - shadcn components first (Dialog, Input, ContextMenu already available)
  - `--sat-*` theme vars for all colors
  - Dumb components in `packages/ui/`, wired in `apps/tauri/`

---

## Current vs Target

### Current (Stubbed)

```
Sidebar "New Note" button     → console.log("create_note")
Sidebar "New Folder" button   → console.log("create_folder")
Command Palette "Create Note" → console.log("Create new file command executed")
Command Palette "Delete Note" → console.log("Delete file command executed")
Rust backend                  → No create/delete commands exist
File tree right-click         → No context menu
```

### Target (Wired)

```
Sidebar "New Note" button     → Dialog opens → Rust creates file → Editor opens it
Sidebar "New Folder" button   → Dialog opens → Rust creates folder → Tree refreshes
Command Palette "Create Note" → Same dialog flow as sidebar button
Command Palette "Delete Note" → Confirm dialog → Rust deletes → Editor clears
File tree right-click         → Context menu with New Note / New Folder / Delete
All mutations                 → Watcher fires → Tree auto-refreshes in sidebar
```

### Data Flow

```
┌───────────────┐     invoke()      ┌─────────────────┐
│   Frontend    │ ─────────────────►│   Rust Backend   │
│               │                   │                  │
│  InputDialog  │                   │  create_note()   │
│  useVault     │                   │  create_folder() │
│  Mutations    │                   │  delete_file()   │
│               │◄─────────────────│                  │
│               │   Result<path>    │  + vault.add()   │
│               │                   │  + vault.remove()│
│               │◄ ─ ─ ─ ─ ─ ─ ─ ─│                  │
│  useVaultTree │   vault://        │  FS Watcher      │
│  (auto-       │   file-changed    │  (auto-emits)    │
│   refresh)    │                   │                  │
└───────────────┘                   └─────────────────┘
```

---

## Phase 1 — Rust Commands

> **Foundation**: Three new Tauri commands for file mutations. All I/O in Rust.

### ✅ What

Add `create_note`, `create_folder`, and `delete_file` commands to the Rust backend.
Each command:
1. Performs the filesystem operation
2. Updates the in-memory vault index (for notes)
3. Returns a result the frontend can act on immediately
   (the watcher will also fire, but the index is already updated)

### 📁 Where

| File | Action |
|------|--------|
| `apps/tauri/src-tauri/src/lib.rs` | **Edit** — add 3 new commands + register them |

### 🔧 How

**1. `create_note` — create a new .md file with frontmatter template:**

```rust
#[derive(Serialize)]
struct CreateNoteResult {
    /// Absolute path of the newly created file.
    path: String,
    /// Display name (filename without extension).
    name: String,
}

#[tauri::command]
fn create_note(
    name: String,
    parent: Option<String>,    // relative folder path inside vault, e.g. "Daily Journal"
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<CreateNoteResult, String> {
    let config = load_config(&app);
    let vault_path = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;

    // ── Build the file path ──────────────────────────────────────────
    // Strip .md if user included it, then force-add it.
    let clean_name = name.trim().trim_end_matches(".md");
    if clean_name.is_empty() {
        return Err("note name cannot be empty".into());
    }

    // Reject invalid filesystem characters.
    if clean_name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')) {
        return Err("note name contains invalid characters".into());
    }

    let file_name = format!("{clean_name}.md");

    let target_dir = match &parent {
        Some(rel) if !rel.is_empty() => Path::new(&vault_path).join(rel),
        _ => PathBuf::from(&vault_path),
    };

    let file_path = target_dir.join(&file_name);

    if file_path.exists() {
        return Err(format!("'{}' already exists", file_name));
    }

    // ── Ensure parent directory exists ───────────────────────────────
    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| format!("failed to create directory: {e}"))?;
    }

    // ── Generate frontmatter ─────────────────────────────────────────
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let content = format!(
        "---\ntype: note\ntopic:\nstatus: inbox\ncreated: {today}\nupdated: {today}\ntags: []\naliases: []\n---\n\n"
    );

    std::fs::write(&file_path, &content)
        .map_err(|e| format!("failed to write file: {e}"))?;

    // ── Update in-memory vault index ─────────────────────────────────
    let abs_path = file_path
        .canonicalize()
        .map_err(|e| format!("canonicalize failed: {e}"))?
        .to_string_lossy()
        .to_string();

    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())?;
        vault.add_document(&abs_path, &content);
    }

    Ok(CreateNoteResult {
        path: abs_path,
        name: clean_name.to_string(),
    })
}
```

**2. `create_folder` — create a new directory:**

```rust
#[tauri::command]
fn create_folder(
    name: String,
    parent: Option<String>,    // relative folder path inside vault
    app: tauri::AppHandle,
) -> Result<String, String> {
    let config = load_config(&app);
    let vault_path = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;

    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err("folder name cannot be empty".into());
    }

    if clean_name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')) {
        return Err("folder name contains invalid characters".into());
    }

    let target_dir = match &parent {
        Some(rel) if !rel.is_empty() => Path::new(&vault_path).join(rel),
        _ => PathBuf::from(&vault_path),
    };

    let folder_path = target_dir.join(clean_name);

    if folder_path.exists() {
        return Err(format!("'{}' already exists", clean_name));
    }

    std::fs::create_dir_all(&folder_path)
        .map_err(|e| format!("failed to create folder: {e}"))?;

    Ok(folder_path.to_string_lossy().to_string())
}
```

**3. `delete_file` — delete a file and remove from index:**

```rust
#[tauri::command]
fn delete_file(
    path: String,
    state: State<AppState>,
) -> Result<(), String> {
    let abs = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("invalid path: {e}"))?;

    if !abs.exists() {
        return Err("file does not exist".to_string());
    }

    // ── Remove from vault index first ────────────────────────────────
    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())?;
        vault.remove_document(abs.to_str().unwrap_or_default());
    }

    // ── Delete from disk ─────────────────────────────────────────────
    if abs.is_dir() {
        std::fs::remove_dir_all(&abs)
            .map_err(|e| format!("failed to delete directory: {e}"))?;
    } else {
        std::fs::remove_file(&abs)
            .map_err(|e| format!("failed to delete file: {e}"))?;
    }

    Ok(())
}
```

**4. Register the new commands:**

```rust
.invoke_handler(tauri::generate_handler![
    boot,
    set_vault,
    set_setting,
    get_settings,
    reindex_vault,
    get_vault_tree,
    open_vault_dialog,
    open_file,
    save_file,
    get_backlinks,
    autocomplete_links,
    autocomplete_tags,
    get_workspace,
    set_workspace_key,
    create_note,       // NEW
    create_folder,     // NEW
    delete_file,       // NEW
])
```

**5. Add `chrono` dependency for date formatting:**

In `apps/tauri/src-tauri/Cargo.toml`:
```toml
[dependencies]
chrono = "0.4"
```

### ✔️ Done when

- [ ] `create_note` creates a .md file with frontmatter at the correct path
- [ ] `create_note` rejects empty names, invalid characters, and existing files
- [ ] `create_note` accepts an optional `parent` relative path for subfolder creation
- [ ] `create_note` updates the in-memory vault index
- [ ] `create_folder` creates a directory at the correct path
- [ ] `delete_file` removes the file from disk and vault index
- [ ] `delete_file` handles directories (for folder deletion)
- [ ] All three commands are registered in the invoke handler
- [ ] App compiles and boots without errors

---

## Phase 2 — Input Dialog UI Component

> **UI Layer**: A reusable dialog for name input. Dumb, no Tauri imports.

### ✅ What

Create a generic `InputDialog` component in `packages/ui/` that can be used for
both "New Note" and "New Folder" prompts. Uses shadcn `Dialog` + `Input`.

### 📁 Where

| File | Action |
|------|--------|
| `packages/ui/src/components/input-dialog/InputDialog.tsx` | **Create** — dumb dialog component |
| `packages/ui/src/components/input-dialog/index.ts` | **Create** — re-export |

### 🔧 How

**InputDialog.tsx:**

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useState, useCallback, useEffect, useRef } from "react";

export interface InputDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog should close. */
  onOpenChange: (open: boolean) => void;
  /** Dialog title, e.g. "New note" or "New folder". */
  title: string;
  /** Optional description text below the title. */
  description?: string;
  /** Placeholder text for the input. */
  placeholder?: string;
  /** Label for the submit button. Default: "Create". */
  submitLabel?: string;
  /** Called with the input value when the user submits. */
  onSubmit: (value: string) => void;
  /** Optional validation error to display. */
  error?: string | null;
  /** Whether submission is in progress (disables the button). */
  isLoading?: boolean;
}

export function InputDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  submitLabel = "Create",
  onSubmit,
  error,
  isLoading,
}: InputDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      setValue("");
      // Focus the input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[400px] bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)]"
      >
        <DialogHeader>
          <DialogTitle className="text-[var(--sat-text-primary)]">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-[var(--sat-text-muted)]">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-2">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="bg-[var(--sat-surface-1)] border-[var(--sat-layout-border)] text-[var(--sat-text-primary)] placeholder:text-[var(--sat-text-muted)]"
            autoFocus
          />
          {error && (
            <p className="text-xs text-[var(--sat-state-danger)] mt-1.5">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[var(--sat-text-secondary)] hover:text-[var(--sat-text-primary)]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            className="bg-[var(--sat-accent-primary)] text-[var(--sat-text-inverse)] hover:opacity-90"
          >
            {isLoading ? "Creating…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**index.ts:**
```ts
export { InputDialog, type InputDialogProps } from "./InputDialog";
```

### ✔️ Done when

- [ ] `InputDialog` renders with title, input, and submit/cancel buttons
- [ ] Input is auto-focused when dialog opens
- [ ] Enter key submits, Escape closes
- [ ] Error message displays below input when provided
- [ ] Loading state disables the submit button
- [ ] Uses `--sat-*` theme vars, no hard-coded colors
- [ ] Component in `packages/ui/` has zero Tauri imports

---

## Phase 3 — Vault Mutations Hook

> **Feature Layer**: A hook that wraps Rust commands and manages dialog state.

### ✅ What

Create `useVaultMutations` hook in the vault feature that:
- Calls `invoke()` for create/delete operations
- Manages dialog open/close state
- Handles errors and loading states
- After creating a note, provides the path so the editor can open it

### 📁 Where

| File | Action |
|------|--------|
| `apps/tauri/src/features/vault/hooks/useVaultMutations.ts` | **Create** — mutation hook |
| `apps/tauri/src/features/vault/types.ts` | **Edit** — add CreateNoteResult type |
| `apps/tauri/src/features/vault/index.ts` | **Edit** — re-export new hook |

### 🔧 How

**Add type to `types.ts`:**

```ts
/** Returned by `create_note` Rust command. */
export interface CreateNoteResult {
  path: string;
  name: string;
}
```

**`useVaultMutations.ts`:**

```ts
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import type { CreateNoteResult } from "../types";

export interface UseVaultMutationsReturn {
  // ── Dialog state ──────────────────────────────────────────────────
  isCreateNoteOpen: boolean;
  setCreateNoteOpen: (open: boolean) => void;
  isCreateFolderOpen: boolean;
  setCreateFolderOpen: (open: boolean) => void;
  isDeleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;

  /** The path of the file pending deletion (set before confirm dialog opens). */
  pendingDeletePath: string | null;
  pendingDeleteName: string | null;

  // ── Error state ───────────────────────────────────────────────────
  error: string | null;
  isLoading: boolean;

  // ── Actions ───────────────────────────────────────────────────────
  /**
   * Create a new note. Returns the result on success so the caller
   * can immediately open it in the editor.
   * @param name — note title (without .md)
   * @param parent — optional relative folder path
   */
  createNote: (name: string, parent?: string) => Promise<CreateNoteResult | null>;

  /**
   * Create a new folder.
   * @param name — folder name
   * @param parent — optional relative parent folder path
   */
  createFolder: (name: string, parent?: string) => Promise<string | null>;

  /**
   * Request deletion of a file. Opens the confirm dialog.
   * Call `confirmDelete()` after user confirms.
   */
  requestDelete: (path: string, name: string) => void;

  /**
   * Execute the pending deletion after user confirms.
   */
  confirmDelete: () => Promise<boolean>;
}

export function useVaultMutations(): UseVaultMutationsReturn {
  // ── Dialog state ────────────────────────────────────────────────────
  const [isCreateNoteOpen, setCreateNoteOpen] = useState(false);
  const [isCreateFolderOpen, setCreateFolderOpen] = useState(false);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);

  // ── Error / loading ─────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Create note ─────────────────────────────────────────────────────
  const createNote = useCallback(
    async (name: string, parent?: string): Promise<CreateNoteResult | null> => {
      setError(null);
      setIsLoading(true);
      try {
        const result = await invoke<CreateNoteResult>("create_note", {
          name,
          parent: parent ?? null,
        });
        setCreateNoteOpen(false);
        return result;
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // ── Create folder ───────────────────────────────────────────────────
  const createFolder = useCallback(
    async (name: string, parent?: string): Promise<string | null> => {
      setError(null);
      setIsLoading(true);
      try {
        const result = await invoke<string>("create_folder", {
          name,
          parent: parent ?? null,
        });
        setCreateFolderOpen(false);
        return result;
      } catch (err) {
        setError(String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // ── Delete file ─────────────────────────────────────────────────────
  const requestDelete = useCallback((path: string, name: string) => {
    setPendingDeletePath(path);
    setPendingDeleteName(name);
    setDeleteConfirmOpen(true);
    setError(null);
  }, []);

  const confirmDelete = useCallback(async (): Promise<boolean> => {
    if (!pendingDeletePath) return false;
    setIsLoading(true);
    setError(null);
    try {
      await invoke("delete_file", { path: pendingDeletePath });
      setDeleteConfirmOpen(false);
      setPendingDeletePath(null);
      setPendingDeleteName(null);
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [pendingDeletePath]);

  return {
    isCreateNoteOpen,
    setCreateNoteOpen,
    isCreateFolderOpen,
    setCreateFolderOpen,
    isDeleteConfirmOpen,
    setDeleteConfirmOpen,
    pendingDeletePath,
    pendingDeleteName,
    error,
    isLoading,
    createNote,
    createFolder,
    requestDelete,
    confirmDelete,
  };
}
```

### ✔️ Done when

- [ ] `useVaultMutations` manages dialog state for create note, create folder, delete
- [ ] `createNote` calls Rust, closes dialog on success, returns result
- [ ] `createFolder` calls Rust, closes dialog on success
- [ ] `requestDelete` + `confirmDelete` two-step pattern works
- [ ] Error state surface for all operations
- [ ] Loading state disables submit during in-flight operations
- [ ] Hook has zero React rendering — pure state + actions

---

## Phase 4 — Wire to Sidebar & Command Palette

> **Wiring Layer**: Connect the hook + dialog to the sidebar buttons and
> command palette commands.

### ✅ What

1. Wire `AppSidebar` buttons to open the dialogs and call mutations
2. Wire `app-commands.tsx` to trigger the same operations
3. Auto-open newly created notes in the editor
4. Clear editor when deleting the currently open note

### 📁 Where

| File | Action |
|------|--------|
| `apps/tauri/src/routes/index.tsx` | **Edit** — add `useVaultMutations`, pass to sidebar, render dialogs |
| `apps/tauri/src/app-shell/AppSidebar.tsx` | **Edit** — accept mutation callbacks as props |
| `apps/tauri/src/commands/app-commands.tsx` | **Edit** — accept mutation callbacks as props, wire real actions |

### 🔧 How

**1. `index.tsx` — orchestration:**

The route component is where all state meets. It calls `useVaultMutations` and
passes the actions down to both the sidebar and commands.

```tsx
// In RouteComponent():

const mutations = useVaultMutations();

// After creating a note, auto-open it in the editor
const handleCreateNote = useCallback(
  async (name: string) => {
    const result = await mutations.createNote(name);
    if (result) {
      editor.loadNote({ name: result.name, path: result.path });
    }
  },
  [mutations, editor],
);

// After deleting the current note, clear the editor
const handleConfirmDelete = useCallback(async () => {
  const deleted = await mutations.confirmDelete();
  if (deleted && mutations.pendingDeletePath === editor.selected?.path) {
    // Clear the editor — no note selected
    // (Need to add a clearEditor function to useEditor, or just set selected=null)
  }
}, [mutations, editor]);

// Render the dialogs + sidebar
return (
  <div className="flex flex-1 min-h-0">
    <AppActivityBar />

    <AppSidebar
      defaultWidth={boot.workspace?.sidebarWidth as number | undefined}
      onCreateNote={() => mutations.setCreateNoteOpen(true)}
      onCreateFolder={() => mutations.setCreateFolderOpen(true)}
    >
      <FileTree ... />
    </AppSidebar>

    {/* ... editor area ... */}

    {/* ── Dialogs ── */}
    <InputDialog
      open={mutations.isCreateNoteOpen}
      onOpenChange={mutations.setCreateNoteOpen}
      title="New note"
      placeholder="Note title"
      submitLabel="Create"
      onSubmit={handleCreateNote}
      error={mutations.error}
      isLoading={mutations.isLoading}
    />

    <InputDialog
      open={mutations.isCreateFolderOpen}
      onOpenChange={mutations.setCreateFolderOpen}
      title="New folder"
      placeholder="Folder name"
      submitLabel="Create"
      onSubmit={(name) => mutations.createFolder(name)}
      error={mutations.error}
      isLoading={mutations.isLoading}
    />

    {/* Delete confirmation dialog (uses shadcn Dialog directly) */}
    <ConfirmDialog
      open={mutations.isDeleteConfirmOpen}
      onOpenChange={mutations.setDeleteConfirmOpen}
      title="Delete note"
      description={`Permanently delete "${mutations.pendingDeleteName}"? This cannot be undone.`}
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={handleConfirmDelete}
    />
  </div>
);
```

**2. `AppSidebar.tsx` — accept action props:**

```tsx
interface AppSidebarProps {
  children: ReactNode;
  defaultWidth?: number;
  onCreateNote: () => void;   // NEW
  onCreateFolder: () => void; // NEW
}

export function AppSidebar({
  children,
  defaultWidth,
  onCreateNote,
  onCreateFolder,
}: AppSidebarProps) {
  // ...

  const actions: SidebarAction[] = [
    {
      id: "new-note",
      icon: <IconFilePlus size={16} stroke={1.5} />,
      label: "New note",
      onClick: onCreateNote,      // CHANGED from console.log
    },
    {
      id: "new-folder",
      icon: <IconFolderPlus size={16} stroke={1.5} />,
      label: "New folder",
      onClick: onCreateFolder,    // CHANGED from console.log
    },
    // sort and collapse-all stay as-is for now
  ];
  // ...
}
```

**3. `app-commands.tsx` — accept mutation callbacks:**

Two approaches here:

**Option A (simpler, recommended)**: Move vault command registration into the
route component where state is available. Create a new `VaultCommands` component:

```tsx
// apps/tauri/src/features/vault/components/VaultCommands.tsx

interface VaultCommandsProps {
  onCreateNote: () => void;
  onDeleteCurrentNote: () => void;
}

export const VaultCommands: React.FC<VaultCommandsProps> = ({
  onCreateNote,
  onDeleteCurrentNote,
}) => {
  const register = useCommandStore((s) => s.register);
  const unregister = useCommandStore((s) => s.unregister);

  const commands = useMemo(
    () => [
      {
        id: "vault:new-note",
        name: "Create New Note",
        category: "File",
        icon: <IconFilePlus size={16} />,
        hotkeys: ["Ctrl+N"],
        callback: onCreateNote,
      },
      {
        id: "vault:delete-note",
        name: "Delete Current Note",
        category: "File",
        icon: <IconTrash size={16} />,
        callback: onDeleteCurrentNote,
      },
    ],
    [onCreateNote, onDeleteCurrentNote],
  );

  useEffect(() => {
    commands.forEach((c) => register(c));
    return () => commands.forEach((c) => unregister(c.id));
  }, [commands, register, unregister]);

  return null;
};
```

Then render `<VaultCommands>` in the route component where all state is available:

```tsx
// In index.tsx RouteComponent:
<VaultCommands
  onCreateNote={() => mutations.setCreateNoteOpen(true)}
  onDeleteCurrentNote={() => {
    if (editor.selected) {
      mutations.requestDelete(editor.selected.path, editor.selected.name);
    }
  }}
/>
```

And remove the `app:new-file` and `app:delete-file` commands from `app-commands.tsx`
(they move to `VaultCommands`).

**4. Collapse All — wire pure UI action:**

In `index.tsx`, add a `collapseAll` function and pass it to sidebar:

```tsx
// In the route component (index.tsx) where useVaultTree is called:
const collapseAll = useCallback(() => {
  // We need to expose a `collapseAll` from useVaultTree
  // or just call setOpenFolders(new Set()) via a new exposed method
}, []);
```

Add a `collapseAll` method to `useVaultTree`:

```ts
// In useVaultTree.ts:
const collapseAll = useCallback(() => {
  setOpenFolders(new Set());
}, []);

return { /* ...existing... */ collapseAll };
```

### ✔️ Done when

- [ ] Clicking "New note" in sidebar opens the input dialog
- [ ] Submitting the dialog creates the note via Rust and opens it in the editor
- [ ] Clicking "New folder" in sidebar opens the input dialog
- [ ] Submitting creates the folder and it appears in the tree
- [ ] `Ctrl+N` from command palette opens the same create-note dialog
- [ ] "Delete Current Note" from command palette shows confirm dialog
- [ ] Confirming delete removes the file and clears the editor
- [ ] "Collapse all" in sidebar collapses all folders
- [ ] Error messages display in the dialog when Rust returns errors
- [ ] Tree auto-refreshes after all mutations (via existing watcher)

---

## Phase 5 — File Tree Context Menu

> **Polish**: Right-click a file/folder in the tree for quick actions.

### ✅ What

Add a context menu to file tree nodes. Right-clicking shows relevant actions:
- **On a file**: Delete, Rename (future)
- **On a folder**: New Note Here, New Folder Here, Delete (future)

### 📁 Where

| File | Action |
|------|--------|
| `packages/ui/src/components/file-tree/FileTree.tsx` | **Edit** — add `onContextMenu` prop |
| `apps/tauri/src/features/vault/components/FileTree.tsx` | **Edit** — wire context menu events |
| `apps/tauri/src/routes/index.tsx` | **Edit** — handle context menu actions |

### 🔧 How

**1. Add context menu callback to the dumb `FileTree` component:**

The `FileNode` already has `isFolder`. Add an `onContextMenu` prop:

```tsx
// In packages/ui FileTree:
export interface FileTreeProps {
  // ...existing props...
  onContextMenu?: (node: FileNode, event: React.MouseEvent) => void;
}
```

In `FileTreeNode`, attach the handler:

```tsx
<div
  onContextMenu={(e) => {
    e.preventDefault();
    onContextMenu?.(node, e);
  }}
  // ...existing props...
>
```

**2. Wire in the vault feature `FileTree`:**

Pass the `onContextMenu` through to the dumb component, mapping back to
`FlatTreeNode` with the relPath available.

**3. In `index.tsx`, render shadcn `ContextMenu` positioned at click coordinates:**

Use a combination of React state (position, target node) and shadcn's
`ContextMenu` with `ContextMenuContent`, `ContextMenuItem`:

```tsx
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  node: FlatTreeNode;
} | null>(null);

// Menu items vary based on whether it's a file or folder:
// File:   "Delete"
// Folder: "New Note Here", "New Folder Here"
```

**Note**: The shadcn `ContextMenu` component works via a trigger wrapper. For
custom positioning (click coordinates), we may need to use the raw
`@radix-ui/react-context-menu` with `ContextMenuTrigger` wrapping each node,
or switch to a `DropdownMenu` positioned absolutely. Evaluate the best approach
during implementation — the shadcn `ContextMenu` wrapping the entire tree and
using the target node from state is cleanest.

### ✔️ Done when

- [ ] Right-clicking a file shows "Delete" option
- [ ] Right-clicking a folder shows "New Note Here" and "New Folder Here"
- [ ] "New Note Here" opens the input dialog with the folder as parent
- [ ] "Delete" shows the same confirm dialog as the command palette
- [ ] Context menu uses `--sat-*` theme vars
- [ ] Context menu dismisses on click-away and Escape

---

## Layer Ownership Map

```
packages/ui/src/components/              ← DUMB (no Tauri, no state)
├── input-dialog/
│   ├── InputDialog.tsx                  Phase 2
│   └── index.ts
├── file-tree/
│   ├── FileTree.tsx                     Phase 5 — add onContextMenu prop
│   └── FileTreeNode.tsx                 Phase 5 — attach handler
└── ui/
    ├── dialog.tsx                       Existing ✅
    ├── input.tsx                        Existing ✅
    ├── button.tsx                       Existing ✅
    └── context-menu.tsx                 Existing ✅

apps/tauri/src-tauri/src/                ← RUST BACKEND
└── lib.rs                               Phase 1 — create_note, create_folder,
                                                    delete_file

apps/tauri/src/features/vault/           ← FEATURE (state + IPC)
├── hooks/
│   ├── useVaultMutations.ts             Phase 3 — NEW
│   ├── useVaultTree.ts                  Phase 4 — add collapseAll
│   └── useVaultActions.ts               Existing ✅
├── components/
│   ├── FileTree.tsx                      Phase 5 — wire context menu
│   └── VaultCommands.tsx                Phase 4 — NEW (command palette wiring)
└── types.ts                             Phase 3 — add CreateNoteResult

apps/tauri/src/app-shell/                ← WIRING
└── AppSidebar.tsx                       Phase 4 — accept onCreateNote/onCreateFolder

apps/tauri/src/routes/
└── index.tsx                            Phase 4 — orchestrate everything

apps/tauri/src/commands/
└── app-commands.tsx                     Phase 4 — remove vault commands (moved to VaultCommands)
```

---

## Validation Checklist

After all 5 phases, the app should pass these checks:

### Functional
- [ ] Sidebar "New note" → dialog → creates file → auto-opens in editor
- [ ] Sidebar "New folder" → dialog → creates folder → appears in tree
- [ ] Sidebar "Collapse all" → all folders collapse
- [ ] `Ctrl+N` → same create-note flow
- [ ] Command palette "Delete Current Note" → confirm → deletes → editor clears
- [ ] Right-click file → "Delete" option works
- [ ] Right-click folder → "New Note Here" creates note inside that folder
- [ ] Creating a note with duplicate name shows an error in the dialog
- [ ] Creating a note with invalid characters (/, \, :) shows an error
- [ ] Tree auto-refreshes after all mutations (no manual refresh needed)

### Rust Backend
- [ ] `create_note` generates correct frontmatter with today's date
- [ ] `create_note` with `parent: Some("Daily Journal")` creates inside subfolder
- [ ] `create_folder` creates nested directories if parent doesn't exist
- [ ] `delete_file` removes from both disk and in-memory vault index
- [ ] All commands handle edge cases (empty name, non-existent path, locked vault)

### Architecture
- [ ] All `packages/ui/` components have zero Tauri imports
- [ ] All colors use `--sat-*` theme variables
- [ ] shadcn `Dialog`, `Input`, `Button`, `ContextMenu` used (not hand-rolled)
- [ ] Mutation logic lives in `useVaultMutations` hook (features layer)
- [ ] Command registration lives in `VaultCommands` component (features layer)
- [ ] Route component (`index.tsx`) only orchestrates — no business logic
