import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
import { Separator } from "@workspace/ui/components/ui/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, MouseEvent, ReactNode } from "react";
import { TabItem } from "./TabItem";
import type { TabItemData } from "./types";

export interface TabsBarProps {
  tabs: TabItemData[];
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onPinToggle?: (tabId: string) => void;
  onTabContextMenu?: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  onTabDragStart?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onTabDragOver?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onTabDrop?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onTabDragEnd?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
}

export function TabsBar({
  tabs,
  onSelectTab,
  onCloseTab,
  onPinToggle,
  onTabContextMenu,
  onTabDragStart,
  onTabDragOver,
  onTabDrop,
  onTabDragEnd,
  leftSlot,
  rightSlot,
  className,
}: TabsBarProps) {
  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      className={cn(
        "flex h-10 items-center gap-2 border-b border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2",
        className,
      )}
    >
      {leftSlot ? <div className="shrink-0">{leftSlot}</div> : null}
      <ScrollArea className="h-full flex-1">
        <div className="flex h-full min-w-max items-center gap-1 pr-2">
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              onSelect={onSelectTab}
              onClose={onCloseTab}
              onPinToggle={onPinToggle}
              onContextMenu={onTabContextMenu}
              onDragStart={onTabDragStart}
              onDragOver={onTabDragOver}
              onDrop={onTabDrop}
              onDragEnd={onTabDragEnd}
            />
          ))}
        </div>
      </ScrollArea>
      {rightSlot ? (
        <>
          <Separator orientation="vertical" className="h-5 bg-[var(--sat-layout-divider)]" />
          <div className="shrink-0">{rightSlot}</div>
        </>
      ) : null}
    </div>
  );
}
