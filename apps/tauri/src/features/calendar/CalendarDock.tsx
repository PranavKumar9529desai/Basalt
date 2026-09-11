import { useMemo } from "react";
import type { DayButton } from "react-day-picker";
import { Calendar, CalendarDayButton } from "@workspace/ui/components/ui/calendar";
import { Button } from "@workspace/ui/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/ui/tooltip";
import {
  IconChevronLeft,
  IconChevronRight,
  IconCalendar,
} from "@tabler/icons-react";
import { cn } from "@workspace/ui/lib/utils";
import type { DayActivity } from "./types";

/**
 * Week-start integer (0=Sun..6=Sat). Matches react-day-picker's prop type.
 */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Resolve the week-start integer from the user setting or the system
 * locale's first day of week (Intl.Locale#weekInfo, modern runtimes).
 * Pure helper — no cross-feature imports.
 */
export function resolveWeekStart(
  setting: string,
  localeCode: string,
): WeekStartsOn {
  if (setting !== "auto" && setting !== "") {
    const n = Number(setting);
    if (!Number.isNaN(n) && n >= 0 && n <= 6) return n as WeekStartsOn;
  }
  // Locale-aware: Intl.Locale#weekInfo — firstDay is 1-7 (TS 5.9 lacks the
  // type; cast through an interface).
  try {
    type WeekInfoLocale = Intl.Locale & { weekInfo?: { firstDay: number } };
    const info = (new Intl.Locale(localeCode ?? "en") as WeekInfoLocale)
      .weekInfo;
    return info ? ((info.firstDay % 7) as WeekStartsOn) : 1;
  } catch {
    return 1; // Monday fallback
  }
}

/** Stable `YYYY-MM-DD` key for a date (matches the Rust key format). */
function isoKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Renders a day cell with activity dots underneath the day number. */
function CalendarDockDay({
  className,
  day,
  modifiers,
  activity,
  ...props
}: React.ComponentProps<typeof DayButton> & {
  activity?: DayActivity;
}) {
  return (
    <CalendarDayButton
      className={cn("relative gap-0.5", className)}
      day={day}
      modifiers={modifiers}
      {...props}
    >
      <span className="flex h-full w-full items-center justify-center">
        {day.date.getDate()}
      </span>
      {/* Activity dots */}
      {activity?.exists && (
        <span className="flex h-1.5 items-center justify-center gap-0.5">
          {activity.word_count > 0 && (
            <span
              className="size-1 rounded-full bg-[var(--sat-state-success)]"
              title={`${activity.word_count} words`}
            />
          )}
          {activity.unfinished_tasks > 0 && (
            <span
              className="size-1 rounded-full bg-[var(--sat-state-warning)]"
              title={`${activity.unfinished_tasks} unfinished tasks`}
            />
          )}
        </span>
      )}
    </CalendarDayButton>
  );
}

export interface CalendarDockProps {
  year: number;
  month: number; // 1-12
  /** Activity per `YYYY-MM-DD`, from the Rust calendar_activity scan. */
  activityMap: Record<string, DayActivity>;
  weekStartsOn: WeekStartsOn;
  showWeekNumbers: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToToday: () => void;
  /** Month navigated internally (DayPicker keyboard arrows) → sync state. */
  onMonthChange: (year: number, month: number) => void;
  /** Open (or create) the daily note for a clicked date. */
  onSelectDay: (date: Date) => void;
}

/**
 * CalendarDock — the right sidebar's calendar view (Obsidian Calendar
 * plugin parity). Renders a month grid via the shadcn Calendar with
 * activity dots per day; clicking a day opens/creates its daily note.
 *
 * Presentational: all data + actions arrive as props from the shared
 * useCalendar orchestration hook (ADR-018 wiring).
 */
export function CalendarDock({
  year,
  month,
  activityMap,
  weekStartsOn,
  showWeekNumbers,
  onPrevMonth,
  onNextMonth,
  onGoToToday,
  onMonthChange,
  onSelectDay,
}: CalendarDockProps) {
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(navigator.language, {
        month: "long",
        year: "numeric",
      }).format(new Date(year, month - 1, 1)),
    [year, month],
  );

  const selectedMonth = new Date(year, month - 1, 1);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-2">
      {/* Month navigation header */}
      <div className="mb-2 flex items-center justify-between gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Previous month"
          onClick={onPrevMonth}
        >
          <IconChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium text-[var(--sat-text-primary)]">
          {monthLabel}
        </span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Go to today"
                  onClick={onGoToToday}
                  className="text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]"
                >
                  <IconCalendar className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Today</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Next month"
            onClick={onNextMonth}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <Calendar
        mode="single"
        month={selectedMonth}
        onMonthChange={(m) => onMonthChange(m.getFullYear(), m.getMonth() + 1)}
        onSelect={(day) => {
          if (day) onSelectDay(day);
        }}
        selected={undefined}
        showWeekNumber={showWeekNumbers}
        weekStartsOn={weekStartsOn}
        // Navigation lives in the custom header — hide built-in chevrons
        // and the caption label (the header already shows the month name).
        classNames={{ nav: "hidden", caption_label: "hidden", dropdowns: "hidden" }}
        components={{
          DayButton: (props) => (
            <CalendarDockDay
              {...props}
              activity={activityMap[isoKey(props.day.date)]}
            />
          ),
        }}
      />
    </div>
  );
}