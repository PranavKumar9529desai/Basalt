import { Button } from "@workspace/ui/components/ui/button";
import type { SettingButtonSpec } from "../../types";

export interface SettingButtonProps {
  button: SettingButtonSpec;
}

/**
 * SettingButton — single action button (ADR-037 §3.3 / spec §4.3).
 * `outline` is the default secondary look; `default` is a CTA.
 */
export function SettingButton({ button }: SettingButtonProps) {
  const variant = button.variant ?? "outline";
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={() => void button.onClick()}
      disabled={button.disabled}
      className={
        variant === "outline"
          ? "bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)] text-xs h-7 px-3"
          : "text-xs h-7 px-3"
      }
    >
      {button.text}
    </Button>
  );
}
