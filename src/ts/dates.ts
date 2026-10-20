/** Local calendar date helpers. Never use UTC/ISO date slices for day keys. */

export type DateKey = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateKey(year: number, monthIndex: number, day: number): DateKey {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function formatMonthKey(year: number, monthIndex: number): MonthKey {
  return `${year}-${pad2(monthIndex + 1)}`;
}

export function todayKey(now = new Date()): DateKey {
  return formatDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function parseDateKey(dateKey: DateKey): { year: number; monthIndex: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const daysInMonth = getDaysInMonth(year, month - 1);
  if (day > daysInMonth) {
    return null;
  }

  return { year, monthIndex: month - 1, day };
}

export function isValidDateKey(dateKey: string): dateKey is DateKey {
  return parseDateKey(dateKey) !== null;
}

export function dateKeyToLocalDate(dateKey: DateKey): Date | null {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return null;
  }
  return new Date(parsed.year, parsed.monthIndex, parsed.day);
}

export function monthKeyFromDateKey(dateKey: DateKey): MonthKey | null {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return null;
  }
  return formatMonthKey(parsed.year, parsed.monthIndex);
}

export function firstDayOfMonth(year: number, monthIndex: number): DateKey {
  return formatDateKey(year, monthIndex, 1);
}

export function lastDayOfMonth(year: number, monthIndex: number): DateKey {
  return formatDateKey(year, monthIndex, getDaysInMonth(year, monthIndex));
}

export function addDays(dateKey: DateKey, days: number): DateKey {
  const date = dateKeyToLocalDate(dateKey);
  if (!date) {
    return dateKey;
  }
  date.setDate(date.getDate() + days);
  return formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

export function compareDateKeys(a: DateKey, b: DateKey): number {
  return a.localeCompare(b);
}

export function isBefore(a: DateKey, b: DateKey): boolean {
  return compareDateKeys(a, b) < 0;
}

export function isAfter(a: DateKey, b: DateKey): boolean {
  return compareDateKeys(a, b) > 0;
}

export function isSameOrBefore(a: DateKey, b: DateKey): boolean {
  return compareDateKeys(a, b) <= 0;
}

export function dayOfWeek(dateKey: DateKey): number {
  const date = dateKeyToLocalDate(dateKey);
  return date ? date.getDay() : 0; // 0 = Sunday
}

export function eachDateInclusive(start: DateKey, end: DateKey): DateKey[] {
  if (isAfter(start, end)) {
    return [];
  }

  const result: DateKey[] = [];
  let cursor = start;
  while (isSameOrBefore(cursor, end)) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

/** Local wall-clock timestamp without Z suffix, noon on the given calendar day. */
export function localNoonTimestamp(dateKey: DateKey): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return `${dateKey}T12:00:00`;
  }
  return `${dateKey}T12:00:00`;
}

export function formatDisplayDate(dateKey: DateKey, options?: Intl.DateTimeFormatOptions): string {
  const date = dateKeyToLocalDate(dateKey);
  if (!date) {
    return dateKey;
  }
  return date.toLocaleDateString(
    "en-US",
    options ?? { weekday: "short", month: "short", day: "numeric", year: "numeric" }
  );
}

export function daysBetween(start: DateKey, end: DateKey): number {
  const a = dateKeyToLocalDate(start);
  const b = dateKeyToLocalDate(end);
  if (!a || !b) {
    return 0;
  }
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
