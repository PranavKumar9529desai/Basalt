import { IconFilePlus, IconFolderPlus, IconArrowsSort, IconChevronUp } from "@tabler/icons-react";
import { SidebarPanel, SidebarHeader, type SidebarAction } from "@workspace/ui/components/sidebar";
import { invoke } from "@tauri-apps/api/core";
import { type ReactNode, useRef, useCallback } from "react";

interface AppSidebarProps {
    children: ReactNode;
    /** Initial sidebar width from .basalt/workspace.json (Tier 3). */
    defaultWidth?: number;
}

export function AppSidebar({ children, defaultWidth }: AppSidebarProps) {
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce-save sidebar width to .basalt/workspace.json (Tier 3)
    const handleWidthChange = useCallback((width: number) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            invoke("set_workspace_key", { key: "sidebarWidth", value: width });
        }, 400);
    }, []);

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
        <SidebarPanel defaultWidth={defaultWidth} onWidthChange={handleWidthChange}>
            <SidebarHeader actions={actions} />
            {children}
        </SidebarPanel>
    );
}
