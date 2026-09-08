import { cn } from "@workspace/ui/lib/utils";
import type React from "react";

export interface SettingItemProps {
  /** Setting name — left column, medium font, high contrast. */
  name: React.ReactNode;
  /** Setting description — muted, relaxed line height. */
  description?: React.ReactNode;
  /** Right-column control widget(s). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * SettingItem — the structural building block of every settings page
 * (ADR-037 §3.1). Exact Obsidian two-column rhythm: name + description
 * on the left, control widget right-aligned, hairline divider between
 * rows.
 */
export function SettingItem({
  name,
  description,
  children,
  className,
}: SettingItemProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-3.5 border-b border-[var(--sat-layout-border)] last:border-b-0 gap-6",
        className,
      )}
    >
      <div className="flex flex-col flex-1 min-w-0 pr-4">
        <span className="text-sm font-medium text-[var(--sat-text-primary)] select-none">
          {name}
        </span>
        {description && (
          <div className="text-xs text-[var(--sat-text-muted)] mt-0.5 leading-relaxed">
            {description}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end flex-shrink-0 gap-2 min-w-0">
        {children}
      </div>
    </div>
  );
}