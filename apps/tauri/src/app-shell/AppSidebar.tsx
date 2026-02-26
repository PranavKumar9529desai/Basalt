import { IconFilePlus, IconFolderPlus, IconArrowsSort, IconChevronUp } from "@tabler/icons-react";
import { SidebarPanel, SidebarHeader, type SidebarAction } from "@workspace/ui/components/sidebar";
// import { useCommandStore } from "@workspace/editor/commands/store";
import type { ReactNode } from "react";

interface AppSidebarProps {
    children: ReactNode;
}

export function AppSidebar({ children }: AppSidebarProps) {
    // const execute = useCommandStore((s) => s.execute);

    const actions: SidebarAction[] = [
        {
            id: "new-note",
            icon: <IconFilePlus size={16} stroke={1.5} />,
            label: "New note",
            onClick: () => console.log("create_note"),
        },
        {
            id: "new-folder",
            icon: <IconFolderPlus size={16} stroke={1.5} />,
            label: "New folder",
            onClick: () => console.log("create_folder"),
        },
        {
            id: "sort",
            icon: <IconArrowsSort size={16} stroke={1.5} />,
            label: "Sort",
            onClick: () => console.log("Sort toggled"),
        },
        {
            id: "collapse-all",
            icon: <IconChevronUp size={16} stroke={1.5} />,
            label: "Collapse all",
            onClick: () => console.log("Collapse all clicked"),
        }
    ];

    return (
        <SidebarPanel>
            <SidebarHeader actions={actions} />
            {children}
        </SidebarPanel>
    );
}
