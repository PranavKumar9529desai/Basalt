import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@workspace/ui/lib/utils";
import * as React from "react";

const ContextMenu = ContextMenuPrimitive.Root;

const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const ContextMenuPortal = ContextMenuPrimitive.Portal;

const ContextMenuContent = React.forwardRef<
  HTMLDivElement,
  ContextMenuPrimitive.PopupProps & {
    anchor?: HTMLElement | { getBoundingClientRect: () => DOMRect } | null;
  }
>(({ className, anchor, ...props }, ref) => (
  <ContextMenuPortal>
    <ContextMenuPrimitive.Positioner
      anchor={anchor}
      sideOffset={4}
      collisionPadding={10}
    >
      <ContextMenuPrimitive.Popup
        ref={ref}
        className={cn(
          "z-[9999] min-w-[14rem] max-w-[20rem] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-md border border-[var(--sat-editor-popover-border,#cbd5e1)] bg-[var(--sat-editor-popover-bg,#ffffff)] p-1 text-[var(--sat-editor-popover-text,#0f172a)] shadow-2xl outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Positioner>
  </ContextMenuPortal>
));
ContextMenuContent.displayName = "ContextMenuContent";

const ContextMenuItem = React.forwardRef<
  HTMLDivElement,
  ContextMenuPrimitive.ItemProps & {
    inset?: boolean;
    icon?: React.ReactNode;
    shortcut?: string;
  }
>(({ className, inset, icon, shortcut, children, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-3 rounded-sm px-3 py-1.5 text-sm outline-none focus:bg-[var(--sat-editor-popover-active-bg,#dbeafe)] focus:text-[var(--sat-editor-popover-active-text,#1d4ed8)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-9",
      className,
    )}
    {...props}
  >
    <div className="flex h-5 w-5 shrink-0 items-center justify-center opacity-90">
      {icon}
    </div>
    <span className="flex-1 truncate font-medium">{children}</span>
    {shortcut && (
      <span className="ml-2 text-[10px] tracking-widest text-[var(--sat-editor-popover-muted,#475569)]">
        {shortcut}
      </span>
    )}
  </ContextMenuPrimitive.Item>
));
ContextMenuItem.displayName = "ContextMenuItem";

const ContextMenuSeparator = React.forwardRef<
  HTMLDivElement,
  ContextMenuPrimitive.SeparatorProps
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={cn(
      "-mx-1 my-1 h-px bg-[var(--sat-editor-popover-border,#cbd5e1)]",
      className,
    )}
    {...props}
  />
));
ContextMenuSeparator.displayName = "ContextMenuSeparator";

const ContextMenuSub = ContextMenuPrimitive.SubmenuRoot;

const ContextMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  ContextMenuPrimitive.SubmenuTriggerProps & {
    inset?: boolean;
    icon?: React.ReactNode;
  }
>(({ className, inset, icon, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubmenuTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center gap-3 rounded-sm px-3 py-1.5 text-sm outline-none focus:bg-[var(--sat-editor-popover-active-bg,#dbeafe)] focus:text-[var(--sat-editor-popover-active-text,#1d4ed8)] data-[state=open]:bg-[var(--sat-editor-popover-active-bg,#dbeafe)] data-[state=open]:text-[var(--sat-editor-popover-active-text,#1d4ed8)]",
      inset && "pl-9",
      className,
    )}
    {...props}
  >
    <div className="flex h-5 w-5 shrink-0 items-center justify-center opacity-90">
      {icon}
    </div>
    <span className="flex-1 truncate font-medium">{children}</span>
    <IconChevronRight className="h-4 w-4 opacity-40 ml-auto shrink-0" />
  </ContextMenuPrimitive.SubmenuTrigger>
));
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

const ContextMenuSubContent = React.forwardRef<
  HTMLDivElement,
  ContextMenuPrimitive.PopupProps & {
    anchor?: HTMLElement | { getBoundingClientRect: () => DOMRect } | null;
  }
>(({ className, anchor, ...props }, ref) => (
  <ContextMenuPortal>
    <ContextMenuPrimitive.Positioner
      anchor={anchor}
      sideOffset={4}
      collisionPadding={10}
    >
      <ContextMenuPrimitive.Popup
        ref={ref}
        className={cn(
          "z-[9999] min-w-[12rem] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-md border border-[var(--sat-editor-popover-border,#cbd5e1)] bg-[var(--sat-editor-popover-bg,#ffffff)] p-1 text-[var(--sat-editor-popover-text,#0f172a)] shadow-2xl outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Positioner>
  </ContextMenuPortal>
));
ContextMenuSubContent.displayName = "ContextMenuSubContent";

const ContextMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold text-[var(--sat-text-primary,#0f172a)]",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));
ContextMenuLabel.displayName = "ContextMenuLabel";

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuPortal,
};
