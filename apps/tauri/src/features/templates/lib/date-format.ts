/**
 * Moment.js-compatible subset formatter (ADR-036, §Conventions 2 & 3).
 *
 * Handles the tokens Basalt templates support, in the local timezone:
 * `YYYY YY MMMM MMM MM M DD D dddd ddd dd d HH H hh h mm m ss s A a`.
 * Unknown text passes through untouched; a literal token is escaped with
 * square brackets, Moment-style (`YYYY[Q]`).
 */

const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Tokens matched longest-first so `YYYY` beats `YY` and `MMMM` beats `MM`. */
const TOKEN_RE =
  /\[[^\]]*\]|Y{4}|Y{2}|M{4}|M{3}|M{2}|M{1}|D{2}|D{1}|d{4}|d{3}|d{2}|d{1}|H{2}|H{1}|h{2}|h{1}|m{2}|m{1}|s{2}|s{1}|A|a/g;

export function formatDate(date: Date, format: string): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const weekDay = date.getDay();
  const hours = date.getHours();
  const hours12 = hours % 12 || 12;

  const tokens: Record<string, string> = {
    YYYY: String(year),
    YY: pad(year % 100),
    MMMM: MONTHS_FULL[month],
    MMM: MONTHS_SHORT[month],
    MM: pad(month + 1),
    M: String(month + 1),
    DD: pad(day),
    D: String(day),
    dddd: DAYS_FULL[weekDay],
    ddd: DAYS_SHORT[weekDay],
    dd: pad(weekDay),
    d: String(weekDay),
    HH: pad(hours),
    H: String(hours),
    hh: pad(hours12),
    h: String(hours12),
    mm: pad(date.getMinutes()),
    m: String(date.getMinutes()),
    ss: pad(date.getSeconds()),
    s: String(date.getSeconds()),
    A: hours < 12 ? "AM" : "PM",
    a: hours < 12 ? "am" : "pm",
  };

  return format.replace(TOKEN_RE, (token) => {
    if (token.startsWith("[")) return token.slice(1, -1);
    return tokens[token] ?? token;
  });
}

/** Rendering defaults for the bare `{{date}}` / `{{time}}` variables. */
export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
export const DEFAULT_TIME_FORMAT = "HH:mm";