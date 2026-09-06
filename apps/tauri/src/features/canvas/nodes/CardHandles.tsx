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

function CardHandles({ borderColor, selected }: CardHandlesProps) {
  return (
    <>
      {SIDES.map(({ id, pos }) => (
        <Handle
          key={id}
          type="source"
          position={pos}
          id={id}
          className={`!w-3 !h-3 !rounded-full !border-2 !bg-[var(--sat-surface-1)] transition-all duration-150 cursor-crosshair hover:!scale-125 hover:!bg-[var(--sat-accent-primary)] hover:!border-[var(--sat-accent-primary)] ${
            selected ? "!opacity-100" : "!opacity-0 group-hover:!opacity-100"
          }`}
          style={{ borderColor, zIndex: 10 }}
        />
      ))}
    </>
  );
}

export default memo(CardHandles);
