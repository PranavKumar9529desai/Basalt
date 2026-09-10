import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

interface CardHandlesProps {
  borderColor: string;
  selected?: boolean;
}

const SIDES = [
  { id: "top", pos: Position.Top },
  { id: "right", pos: Position.Right },
  { id: "bottom", pos: Position.Bottom },
  { id: "left", pos: Position.Left },
] as const;

function CardHandlesInner({ borderColor, selected }: CardHandlesProps) {
  const highlightColor =
    borderColor && borderColor !== "var(--sat-layout-border)"
      ? borderColor
      : "var(--sat-accent-primary, #6366f1)";

  return (
    <>
      {SIDES.map(({ id, pos }) => (
        <Handle
          key={id}
          type="source"
          position={pos}
          id={id}
          className={`!w-3.5 !h-3.5 !rounded-full !border-2 transition-all duration-150 cursor-crosshair hover:!scale-125 hover:!brightness-110 shadow-sm ${
            selected ? "!opacity-100" : "!opacity-0 group-hover:!opacity-100"
          }`}
          style={{
            backgroundColor: highlightColor,
            borderColor: "var(--sat-surface-1)",
            boxShadow: `0 0 0 1px ${highlightColor}, 0 2px 4px rgba(0,0,0,0.25)`,
            zIndex: 10,
          }}
        />
      ))}
    </>
  );
}

export const CardHandles = memo(CardHandlesInner);
