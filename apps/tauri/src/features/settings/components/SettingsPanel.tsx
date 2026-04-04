import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
import { Suspense } from "react";
import { useSettingsStore } from "../store";

export function SettingsPanel() {
  const { sections, activeSection } = useSettingsStore();
  const section = sections.find((s) => s.id === activeSection);

  if (!section) return null;

  const SectionComponent = section.component as React.ElementType;

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="max-w-2xl px-12 py-8">
        <Suspense fallback={null}>
          <SectionComponent />
        </Suspense>
      </div>
    </ScrollArea>
  );
}
