// Time helpers shared by server and client. All group times are wall-clock times in the
// group's IANA time zone; a "day" runs from 04:00 to 03:59 like Setlog, so a clip posted
// at 01:00 still belongs to the evening before.

export const DAY_START_HOUR = 4;
const DAY_MS = 86_400_000;

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

export function isValidTimeZone(timeZone: string) {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

const isoDate = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10);

/** Position of a clock hour within the logical day: 04:00 → 0 … 03:00 → 23. */
export const slotOrder = (hour: number) => (hour - DAY_START_HOUR + 24) % 24;

export function currentSlot(now: Date, timeZone: string) {
  const p = localParts(now, timeZone);
  let dayMs = Date.UTC(p.year, p.month - 1, p.day);
  if (p.hour < DAY_START_HOUR) dayMs -= DAY_MS;
  return { day: isoDate(dayMs), hour: p.hour, minute: p.minute };
}

export const isValidWindow = (firstHour: number, lastHour: number) => slotOrder(firstHour) <= slotOrder(lastHour);

export function inWindow(hour: number, firstHour: number, lastHour: number) {
  const o = slotOrder(hour);
  return slotOrder(firstHour) <= o && o <= slotOrder(lastHour);
}

/** Drop hours in day order, e.g. 6..22 → [6, 7, …, 22]. */
export function windowHours(firstHour: number, lastHour: number) {
  const hours: number[] = [];
  for (let o = slotOrder(firstHour); o <= slotOrder(lastHour); o++) hours.push((o + DAY_START_HOUR) % 24);
  return hours;
}

/** The next drop after `hour` today, or null when today's last drop has passed. */
export function nextDropHour(hour: number, firstHour: number, lastHour: number) {
  const o = slotOrder(hour);
  if (o < slotOrder(firstHour)) return firstHour;
  if (o < slotOrder(lastHour)) return (hour + 1) % 24;
  return null;
}

export const formatHour = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function addDays(day: string, delta: number) {
  return isoDate(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS);
}

export function dayLabel(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

/** "Tokyo" from "Asia/Tokyo", "New York" from "America/New_York". */
export const cityName = (timeZone: string) => timeZone.split("/").pop()!.replace(/_/g, " ");

export function clockIn(date: Date, timeZone: string) {
  const p = localParts(date, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Minutes the zone is ahead of UTC at that instant (Tokyo: +540). */
export function tzOffsetMinutes(timeZone: string, date: Date) {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

/** Today's hour:00 in `fromZone`, shown as a clock time in `toZone` ("06:00" Tokyo → "23:00" Warsaw). */
export function convertHour(hour: number, fromZone: string, toZone: string, now = new Date()) {
  const p = localParts(now, fromZone);
  const guess = Date.UTC(p.year, p.month - 1, p.day, hour);
  const instant = new Date(guess - tzOffsetMinutes(fromZone, new Date(guess)) * 60_000);
  return clockIn(instant, toZone);
}
