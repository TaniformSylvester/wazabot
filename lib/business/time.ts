/**
 * Local date/time strings in a business's timezone, for appointment slots.
 * The model reads and writes times as "YYYY-MM-DDTHH:mm" in local time; the
 * server matches them against real slots, so no timezone maths is trusted
 * to the model.
 */

function parts(at: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === type)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), weekday: get("weekday") };
}

/** "2026-10-08" in the business's timezone. */
export function localDate(at: Date, timeZone: string) {
  const { y, m, d } = parts(at, timeZone);
  return `${y}-${m}-${d}`;
}

/** "10:00" in the business's timezone. */
export function localTime(at: Date, timeZone: string) {
  const { h, min } = parts(at, timeZone);
  return `${h}:${min}`;
}

/** "2026-10-08T10:00" in the business's timezone. */
export function localStamp(at: Date, timeZone: string) {
  return `${localDate(at, timeZone)}T${localTime(at, timeZone)}`;
}

/** "Thu" in the business's timezone. */
export function localWeekday(at: Date, timeZone: string) {
  return parts(at, timeZone).weekday;
}

export const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const LOCAL_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Today's date in the business's timezone ("2026-10-08"). */
export function todayLocal(timeZone: string) {
  return localDate(new Date(), timeZone);
}
