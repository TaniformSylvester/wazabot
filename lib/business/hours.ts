import { z } from "zod";

/**
 * Weekly opening hours, stored in businesses.opening_hours:
 *   { "mon": { "closed": false, "open": "08:00", "close": "18:00" }, … }
 * Times are local to the business timezone. A day missing from the object
 * means "not set". Closing after midnight is written as close < open.
 */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalid_time");

export const dayHoursSchema = z.object({ closed: z.boolean(), open: time, close: time });
export type DayHours = z.infer<typeof dayHoursSchema>;

export const openingHoursSchema = z.partialRecord(z.enum(WEEKDAYS), dayHoursSchema);
export type OpeningHours = z.infer<typeof openingHoursSchema>;

/** Parses a stored value; anything malformed is dropped rather than trusted. */
export function parseOpeningHours(value: unknown): OpeningHours {
  const out: OpeningHours = {};
  if (!value || typeof value !== "object") return out;
  for (const day of WEEKDAYS) {
    const parsed = dayHoursSchema.safeParse((value as Record<string, unknown>)[day]);
    if (parsed.success) out[day] = parsed.data;
  }
  return out;
}

export const DEFAULT_OPENING_HOURS: Required<OpeningHours> = {
  mon: { closed: false, open: "08:00", close: "18:00" },
  tue: { closed: false, open: "08:00", close: "18:00" },
  wed: { closed: false, open: "08:00", close: "18:00" },
  thu: { closed: false, open: "08:00", close: "18:00" },
  fri: { closed: false, open: "08:00", close: "18:00" },
  sat: { closed: false, open: "09:00", close: "16:00" },
  sun: { closed: true, open: "09:00", close: "13:00" },
};

export function hasOpeningHours(hours: OpeningHours) {
  return WEEKDAYS.some((d) => hours[d] !== undefined);
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Local weekday + minutes-since-midnight for an instant in a timezone. */
function localParts(at: Date, timeZone: string): { day: Weekday; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("weekday").slice(0, 3).toLowerCase() as Weekday;
  return { day, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * Is the business open at `at`? Returns null when no hours are set (unknown),
 * so callers never claim "closed" without data.
 */
export function isOpenAt(hours: OpeningHours, timeZone: string, at: Date = new Date()): boolean | null {
  if (!hasOpeningHours(hours)) return null;
  const { day, minute } = localParts(at, timeZone);
  const today = hours[day];
  const prevDay = WEEKDAYS[(WEEKDAYS.indexOf(day) + 6) % 7];
  const yesterday = hours[prevDay];

  // Late opening from yesterday that runs past midnight.
  if (yesterday && !yesterday.closed && minutes(yesterday.close) < minutes(yesterday.open) && minute < minutes(yesterday.close)) {
    return true;
  }
  if (!today || today.closed) return false;
  const open = minutes(today.open);
  const close = minutes(today.close);
  if (close === open) return true; // open 24h
  return close > open ? minute >= open && minute < close : minute >= open;
}
