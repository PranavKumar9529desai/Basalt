import { create } from "zustand";

/** Target of an in-place task edit (the task line in the active note). */
export interface TaskEditTarget {
  path: string;
  /** 1-based line number of the task checkbox. */
  line: number;
}

interface TaskModalState {
  isOpen: boolean;
  mode: "create" | "edit";
  editTarget: TaskEditTarget | null;
  openCreate: () => void;
  openEdit: (target: TaskEditTarget) => void;
  close: () => void;
}

/** Modal open/close + mode state for the create/edit task dialog. */
export const useTaskModalStore = create<TaskModalState>()((set) => ({
  isOpen: false,
  mode: "create",
  editTarget: null,
  openCreate: () => set({ isOpen: true, mode: "create", editTarget: null }),
  openEdit: (editTarget) => set({ isOpen: true, mode: "edit", editTarget }),
  close: () => set({ isOpen: false }),
}));