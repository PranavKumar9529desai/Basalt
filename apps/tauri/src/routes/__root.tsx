import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TooltipProvider } from "@workspace/ui/components/ui/tooltip";
import { EditorCommandPalette } from "../features/editor/components/CommandPalette";
import { StatusBar } from "../app-shell/StatusBar";

export const Route = createRootRoute({
  component: () => (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] overflow-hidden">
        <EditorCommandPalette />
        {/* Main workspace area — fills all space */}
        <div className="flex flex-1 min-h-0">
          <Outlet />
        </div>
        {/* Status bar — always visible */}
        <StatusBar />
      </div>
    </TooltipProvider>
  ),
});
