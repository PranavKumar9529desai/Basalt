# UI Package

This package contains all shared UI components for the Basalt application suite.

## Architecture Guidelines

**CRITICAL: All UI components must be created here.**
To keep the UI and business logic totally separate, applications (like `apps/tauri`) should **not** contain their own UI components. All reusable presentation components must live in this `packages/ui` workspace.

### Component Organization

1. **Shadcn UI Components**:
   When using the CLI (`bunx shadcn@latest add <component>`), components will automatically be placed in:
   `src/components/ui/<component>.tsx`

2. **Custom / Composite Components**:
   When creating more complex composite components (like a text editor), create a dedicated folder inside `src/components/`:
   ```
   src/components/code-editor/
   ├── editor-header.tsx
   ├── editor-body.tsx
   └── index.tsx
   ```

By grouping custom features into their own folders (e.g., `code-editor`), we keep the base `ui` folder clean for pure Shadcn atoms and maintain an organized structure for our own complex, composite components.
