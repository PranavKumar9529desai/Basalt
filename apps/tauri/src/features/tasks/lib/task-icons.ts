/**
 * Centralized icon imports for the tasks feature (ADR-048 §10.1).
 * All task UI components import icons from here — never scattered
 * `@tabler/icons-react` imports.
 */
import {
  IconCheckbox,
  IconRefresh,
  IconFlag,
  IconCalendarEvent,
  IconCalendarOff,
  IconLayoutKanban,
} from "@tabler/icons-react";

export const TASK_ICONS = {
  checkbox: IconCheckbox,
  refresh: IconRefresh,
  flag: IconFlag,
  calendarEvent: IconCalendarEvent,
  calendarOff: IconCalendarOff,
  kanban: IconLayoutKanban,
} as const;
