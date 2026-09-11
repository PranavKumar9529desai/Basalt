import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "../features/settings";
import { expandTemplate, formatDate } from "../features/templates";
import { stemOf } from "@workspace/ui";
import type { DayActivity } from "../features/calendar";

/**
 * Open (or create) the daily note for an arbitrary date — reads the dailies
 * settings (folder/format/template) at call time, expands the template in
 * TS (ADR-036 §3), and reuses the idempotent `open_daily_note` Rust command.
 * Standalone so both the calendar dock and `calendar:open-today` share it.
 */
export async function openDailyNoteAt(
  date: Date,
  openNote: (path: string, line?: number) => void,
) {
  const folder = getSetting("dailyNotesFolder");
  const dateFormat = getSetting("dailyNoteDateFormat");
  const template = getSetting("dailyNoteTemplate");

  const fileName = formatDate(date, dateFormat);
  const title = stemOf(fileName) || fileName;

  let content = "";
  if (template) {
    try {
      const raw = await invoke<string>("read_template", { name: template });
      content = expandTemplate(raw, { title, now: date });
    } catch (err) {
      console.warn(
        `Daily template "${template}" could not be read; creating blank note.`,
        err,
      );
    }
  }

  const result = await invoke<{ path: string; name: string }>(
    "open_daily_note",
    { parent: folder, name: fileName, content },
  );
  openNote(result.path);
}

/**
 * Calendar orchestration (cross-feature seam — lives in shared/, ADR-018):
 * merges settings (dailies folder/format/template), the template engine,
 * and the workspace `openNote` jump so the presentational CalendarDock stays
 * feature-pure.
 *
 * Mirrors `dailies:open-today` (useShellCommands) but for an arbitrary date.
 */
export function useCalendar(openNote: (path: string, line?: number) => void) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const folder = getSetting("dailyNotesFolder");
  const dateFormat = getSetting("dailyNoteDateFormat");

  // Activity data for the currently displayed month (fetched from Rust).
  const [activityMap, setActivityMap] = useState<Record<string, DayActivity>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    invoke<Record<string, DayActivity>>("calendar_activity", {
      parent: folder,
      dateFormat,
      year,
      month,
    })
      .then((data) => {
        if (!cancelled) setActivityMap(data);
      })
      .catch((err) => {
        console.warn(`calendar_activity failed (${year}-${month}):`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [folder, dateFormat, year, month]);

  // Navigate to previous month
  const prevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 1) {
        setYear((y) => y - 1);
        return 12;
      }
      return m - 1;
    });
  }, []);

  // Navigate to next month
  const nextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 12) {
        setYear((y) => y + 1);
        return 1;
      }
      return m + 1;
    });
  }, []);

  // Jump to today's month
  const goToToday = useCallback(() => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
  }, []);

  // Open (or create) the daily note for a specific date.
  const openDate = useCallback(
    (date: Date) => openDailyNoteAt(date, openNote),
    [openNote],
  );

  return {
    year,
    month,
    setYear,
    setMonth,
    prevMonth,
    nextMonth,
    goToToday,
    openDate,
    activityMap,
  };
}
