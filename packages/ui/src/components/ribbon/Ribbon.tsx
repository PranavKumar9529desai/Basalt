import type { FC } from "react";
import type { RibbonItemData } from "./RibbonItem";
import { RibbonItem } from "./RibbonItem";

export interface RibbonProps {
  topItems: RibbonItemData[];
  bottomItems: RibbonItemData[];
  activeId: string | null;
  onItemClick: (id: string) => void;
}

export const Ribbon: FC<RibbonProps> = ({
  topItems,
  bottomItems,
  activeId,
  onItemClick,
}) => {
  return (
    <div className="flex flex-col w-11 shrink-0 h-full border-r border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]">
      <div className="flex flex-col items-center mt-2 space-y-2">
        {topItems.map((item) => (
          <RibbonItem
            key={item.id}
            {...item}
            isActive={activeId === item.id}
            onClick={onItemClick}
          />
        ))}
      </div>
      <div className="flex flex-col items-center mt-auto mb-2 space-y-2">
        {bottomItems.map((item) => (
          <RibbonItem
            key={item.id}
            {...item}
            isActive={activeId === item.id}
            onClick={onItemClick}
          />
        ))}
      </div>
    </div>
  );
};
