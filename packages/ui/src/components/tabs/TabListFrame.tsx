import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";

export interface TabListFrameProps {
  tabsBar?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function TabListFrame({
  tabsBar,
  children,
  className,
}: TabListFrameProps) {
  return (
    <div
      className={cn(
        "relative flex flex-1 min-h-0 min-w-0 flex-col border border-[var(--sat-layout-border)] bg-[var(--sat-editor-background)]",
        className,
      )}
    >
      {tabsBar}{" "}
      <div className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
