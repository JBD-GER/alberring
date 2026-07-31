import { eachDayOfInterval, isWeekend, parseISO } from "date-fns";
export function calculateWeekdays(
  startsOn: string,
  endsOn: string,
  dayFraction: 0.5 | 1 = 1,
  holidays: string[] = [],
) {
  const holidaySet = new Set(holidays);
  const days = eachDayOfInterval({
    start: parseISO(startsOn),
    end: parseISO(endsOn),
  }).filter(
    (day) => !isWeekend(day) && !holidaySet.has(day.toISOString().slice(0, 10)),
  ).length;
  return days * dayFraction;
}
export function shiftsOverlap(
  first: { startsAt: string; endsAt: string },
  second: { startsAt: string; endsAt: string },
) {
  return (
    new Date(first.startsAt) < new Date(second.endsAt) &&
    new Date(second.startsAt) < new Date(first.endsAt)
  );
}
export function shouldDeliverNotification(
  preference: {
    enabled: boolean;
    quietStart?: string | null;
    quietEnd?: string | null;
  },
  localTime: string,
) {
  if (!preference.enabled) return false;
  if (!preference.quietStart || !preference.quietEnd) return true;
  const { quietStart, quietEnd } = preference;
  const quiet =
    quietStart <= quietEnd
      ? localTime >= quietStart && localTime < quietEnd
      : localTime >= quietStart || localTime < quietEnd;
  return !quiet;
}
export function mileagePlausibility(
  previous: number,
  next: number,
  maxMonthlyIncrease = 10_000,
) {
  if (!Number.isInteger(next) || next < previous)
    return { valid: false, extreme: false };
  return { valid: true, extreme: next - previous > maxMonthlyIncrease };
}
