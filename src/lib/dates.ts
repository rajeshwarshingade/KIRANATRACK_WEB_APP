/**
 * Date and expiry maths.
 *
 * Every date in the store is a date-only ISO string (`YYYY-MM-DD`). This is a
 * deliberate constraint, not a simplification:
 *
 *  - A `Date` is an instant. "This batch expires on 14 March" is not an
 *    instant — it is a whole day, and the same string becomes a different day
 *    (or the previous one entirely) depending on the reader's timezone. A shop
 *    in IST reading an expiry written as `Date` would see items expire a day
 *    early or late, which for a legal date on a food packet is unacceptable.
 *
 *  - `new Date("2026-03-14")` is parsed by the engine as UTC midnight, which in
 *    IST is 05:30 on the 14th. Any `getDate()` call then returns the 13th. Every
 *    helper below therefore works on the string components directly and never
 *    constructs a local `Date` from a date-only string.
 *
 * The one place a real `Date` is used is `todayISO()`, and it reads the local
 * calendar fields — because "today" genuinely is local to the shop.
 */

/** Days in the expiry-warning window are counted from today, inclusive of both ends. */
export const MS_PER_DAY = 86_400_000;

/** Pad to two digits for ISO formatting. */
const pad = (n: number) => String(n).padStart(2, "0");

/** Today's calendar date in the device's timezone, as `YYYY-MM-DD`. */
export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Current wall-clock time as `HH:MM`, used by the day-book cut-off. */
export function nowHHMM(): string {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** True for a well-formed `YYYY-MM-DD` that names a real day. */
export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  // Rejects 31 Feb and similar: build the date and read the month back.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

/** Split an ISO date into its numeric parts without constructing a local Date. */
function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/**
 * Whole days from `from` to `to`, negative when `to` is earlier.
 *
 * Computed in UTC so daylight-saving transitions in the reader's timezone
 * cannot shift the result by an hour and, across a boundary, by a whole day.
 */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(...dateTriple(from));
  const b = Date.UTC(...dateTriple(to));
  return Math.round((b - a) / MS_PER_DAY);
}

/** `[year, monthIndex, day]` for `Date.UTC`. */
function dateTriple(iso: string): [number, number, number] {
  const { y, m, d } = parts(iso);
  return [y, m - 1, d];
}

/**
 * Days until a date expires. Negative once it has passed.
 *
 * Today counts as 0, not as expiring today — an item whose date is today is
 * still sellable at the counter and is flagged, not blocked.
 */
export function daysUntil(iso: string, from: string = todayISO()): number {
  return daysBetween(from, iso);
}

/** `YYYY-MM-DD` for a day offset from a base date. */
export function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  const probe = new Date(Date.UTC(y, m - 1, d + days));
  return `${probe.getUTCFullYear()}-${pad(probe.getUTCMonth() + 1)}-${pad(probe.getUTCDate())}`;
}

/** Human date for receipts: `14 Mar 2026`. */
export function formatDate(iso: string | null): string {
  if (!iso || !isISODate(iso)) return "—";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const { y, m, d } = parts(iso);
  return `${d} ${months[m - 1]} ${y}`;
}

/** Short date for dense tables and chart axes: `14 Mar`. */
export function formatDateShort(iso: string | null): string {
  if (!iso || !isISODate(iso)) return "—";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const { m, d } = parts(iso);
  return `${d} ${months[m - 1]}`;
}

/** `14 Mar 2026, 4:35 pm` for invoice stamps and the audit trail. */
export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "—";

  let hours = date.getHours();
  const suffix = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;

  return `${formatDate(toISODate(date))}, ${hours}:${pad(date.getMinutes())} ${suffix}`;
}

/** `YYYY-MM-DD` from a `Date`, read in local time. */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days ago a timestamp was, relative to today. */
export function daysSince(timestamp: string, from: string = todayISO()): number {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return daysBetween(toISODate(date), from);
}

/**
 * Stock health from an expiry date.
 *
 * `none` is a distinct state rather than a synonym for `fresh`: a bag of rice
 * with no tracked expiry must not be counted in the "fresh" pool, or the
 * inventory-health donut silently overstates how much of the shop is being
 * actively date-tracked.
 *
 * Thresholds come from settings so the shop owner chooses them, not the app.
 */
export function expiryHealth(
  expiry: string | null,
  warnDays: number,
  criticalDays: number,
  today: string = todayISO(),
): "expired" | "critical" | "warning" | "fresh" | "none" {
  if (expiry === null) return "none";

  const left = daysBetween(today, expiry);
  if (left < 0) return "expired";
  if (left <= criticalDays) return "critical";
  if (left <= warnDays) return "warning";
  return "fresh";
}

/** Short label for a health state. */
export function healthLabel(
  health: "expired" | "critical" | "warning" | "fresh" | "none",
): string {
  switch (health) {
    case "expired":
      return "Expired";
    case "critical":
      return "Urgent";
    case "warning":
      return "Soon";
    case "fresh":
      return "Fresh";
    case "none":
      return "No expiry";
  }
}

/** Short relative description: `Expired 3d ago`, `Today`, `In 12d`. */
export function expiryCaption(expiry: string | null): string {
  if (!expiry || !isISODate(expiry)) return "—";
  const left = daysUntil(expiry);

  if (left < 0) {
    const ago = Math.abs(left);
    return ago === 1 ? "Expired yesterday" : `Expired ${ago}d ago`;
  }
  if (left === 0) return "Expires today";
  if (left === 1) return "Tomorrow";
  return `In ${left}d`;
}

/** Age of stock in whole days, for the dead-stock advisor. */
export function stockAgeDays(receivedOn: string, today: string = todayISO()): number {
  return Math.max(0, daysBetween(receivedOn, today));
}

/** The last `count` dates ending today, oldest first — the axis for trend charts. */
export function recentDates(count: number, today: string = todayISO()): string[] {
  const dates: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) dates.push(addDays(today, -i));
  return dates;
}

/** Month key (`YYYY-MM`) for a date, used to group the monthly report. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** `Mar 2026` for a `YYYY-MM` key. */
export function formatMonth(key: string): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const [y, m] = key.split("-").map(Number);
  return `${months[m - 1] ?? ""} ${y}`;
}
