import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Select — shadcn-style wrapper over @base-ui/react/select with the
 * --sat theme tokens baked in (ADR-002/003). Compound API mirrors the
 * base-ui parts (`<Select.Root>`, `<Select.Trigger>`, …) so callers no
 * longer hand-roll the trigger/popup/item markup (previously duplicated
 * in settings, graph controls, and the task modal).
 */

function SelectRoot<Value, Multiple extends boolean | undefined = false>(
  props: SelectPrimitive.Root.Props<Value, Multiple>,
) {
  return <SelectPrimitive.Root data-slot="select-root" {...props} />;
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-8 min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2.5 text-xs text-[var(--sat-text-primary)] outline-none transition-colors hover:border-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)] data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </SelectPrimitive.Trigger>
  );
}

function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectIcon({
  className,
  children,
  ...props
}: SelectPrimitive.Icon.Props) {
  return (
    <SelectPrimitive.Icon
      data-slot="select-icon"
      className={cn("flex-shrink-0 text-[var(--sat-text-muted)]", className)}
      {...props}
    >
      {children}
    </SelectPrimitive.Icon>
  );
}

function SelectPortal(props: SelectPrimitive.Portal.Props) {
  return <SelectPrimitive.Portal data-slot="select-portal" {...props} />;
}

function SelectPositioner({
  className,
  ...props
}: SelectPrimitive.Positioner.Props) {
  return (
    <SelectPrimitive.Positioner
      data-slot="select-positioner"
      className={cn(className)}
      {...props}
    />
  );
}

function SelectPopup({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Popup
      data-slot="select-popup"
      className={cn(
        "z-50 min-w-[160px] rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] p-1 shadow-2xl",
        className,
      )}
      {...props}
    >
      {children}
    </SelectPrimitive.Popup>
  );
}

function SelectList({ className, ...props }: SelectPrimitive.List.Props) {
  return (
    <SelectPrimitive.List
      data-slot="select-list"
      className={cn(className)}
      {...props}
    />
  );
}

function SelectItem({ className, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs text-[var(--sat-text-secondary)] outline-none select-none data-[highlighted]:bg-[var(--sat-surface-3)] data-[highlighted]:text-[var(--sat-text-primary)] data-[selected]:text-[var(--sat-accent-primary)]",
        className,
      )}
      {...props}
    />
  );
}

function SelectItemText(props: SelectPrimitive.ItemText.Props) {
  return <SelectPrimitive.ItemText data-slot="select-item-text" {...props} />;
}

function SelectItemIndicator({
  className,
  children,
  ...props
}: SelectPrimitive.ItemIndicator.Props) {
  return (
    <SelectPrimitive.ItemIndicator
      data-slot="select-item-indicator"
      className={cn("flex-shrink-0", className)}
      {...props}
    >
      {children}
    </SelectPrimitive.ItemIndicator>
  );
}

/** Compound namespace — mirrors `Select.Root` … base-ui usage at a glance. */
const Select = {
  Root: SelectRoot,
  Trigger: SelectTrigger,
  Value: SelectValue,
  Icon: SelectIcon,
  Portal: SelectPortal,
  Positioner: SelectPositioner,
  Popup: SelectPopup,
  List: SelectList,
  Item: SelectItem,
  ItemText: SelectItemText,
  ItemIndicator: SelectItemIndicator,
};

export {
  Select,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectPortal,
  SelectPositioner,
  SelectPopup,
  SelectList,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
};
