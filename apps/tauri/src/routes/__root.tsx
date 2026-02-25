import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { ThemeSelect } from "../app-shell/ThemeSelect";
import { AppCommands } from "../commands/app-commands";
import { EditorCommandPalette } from "../features/editor/components/EditorCommandPalette";

export const Route = createRootRoute({
  component: () => (
    <div className="p-4 flex flex-col min-h-screen bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)]">
      <AppCommands />
      <EditorCommandPalette />
      <div className="flex gap-4 p-2 border-b border-[var(--sat-layout-border)] mb-4 items-center">
        <Link
          to="/"
          className="hover:text-[var(--sat-accent-primary)] [&.active]:text-[var(--sat-accent-primary)] [&.active]:font-bold"
        >
          Home
        </Link>
        <Link
          to="/new"
          className="hover:text-[var(--sat-accent-primary)] [&.active]:text-[var(--sat-accent-primary)] [&.active]:font-bold"
        >
          New Page
        </Link>
        <div className="ml-auto">
          <ThemeSelect />
        </div>
      </div>
      <Outlet />
    </div>
  ),
});
