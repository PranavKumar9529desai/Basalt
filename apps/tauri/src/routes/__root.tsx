import { createRootRoute, Outlet } from "@tanstack/react-router";
import { CommandProvider } from "@workspace/commands";
import { KeybindingListener, KeybindingProvider } from "@workspace/keybindings";
import { TooltipProvider } from "@workspace/ui/components/ui/tooltip";
import { EditorCommandPalette } from "../features/editor";
import { StatusBar } from "../app-shell";

export const Route = createRootRoute({
  component: () => (
    <CommandProvider>
      <KeybindingProvider>
        <KeybindingListener />
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
      </KeybindingProvider>
    </CommandProvider>
  ),
});
