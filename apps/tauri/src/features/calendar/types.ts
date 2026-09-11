/** Activity data for a single day, returned by the Rust calendar_activity command. */
export interface DayActivity {
  /** Whether a daily note exists for this date. */
  exists: boolean;
  /** Word count of the note (0 if no note). */
  word_count: number;
  /** Number of unfinished tasks (`- [ ]` lines) in the note. */
  unfinished_tasks: number;
}

/** A day cell in the calendar grid. */
export interface CalendarDay {
  /** The date this cell represents. */
  date: Date;
  /** Whether this day is in the currently displayed month. */
  isCurrentMonth: boolean;
  /** Whether this day is today. */
  isToday: boolean;
  /** Activity data, if available (undefined for days outside the fetched range). */
  activity?: DayActivity;
}
