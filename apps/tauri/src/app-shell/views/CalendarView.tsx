import { CalendarDock, resolveWeekStart } from "../../features/calendar";
import { useAppContext } from "../../shared";
import { useCalendar } from "../../shared/useCalendar";
import { useSetting } from "../../features/settings";

/**
 * Calendar view — the right dock's registered view.
 * Shell glue only (ADR-018 view registry pattern): pulls the workspace
 * `openNote` seam + the shared useCalendar orchestration hook, then hands
 * a fully presentational CalendarDock.
 */
export function Calendar() {
  const { openNote } = useAppContext();
  const calendar = useCalendar(openNote);

  const weekStartSetting = useSetting("calendarWeekStart");
  const showWeekNumbers = useSetting("calendarShowWeekNumbers");

  return (
    <CalendarDock
      year={calendar.year}
      month={calendar.month}
      activityMap={calendar.activityMap}
      weekStartsOn={resolveWeekStart(weekStartSetting, navigator.language)}
      showWeekNumbers={showWeekNumbers}
      onPrevMonth={calendar.prevMonth}
      onNextMonth={calendar.nextMonth}
      onGoToToday={calendar.goToToday}
      onMonthChange={(y, m) => {
        calendar.setYear(y);
        calendar.setMonth(m);
      }}
      onSelectDay={(date) => void calendar.openDate(date)}
    />
  );
}
