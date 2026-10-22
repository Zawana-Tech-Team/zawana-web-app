export function normalizeBookingTime(value: string): string {
  return value.replace(
    /\u00e2\u20ac\u201d|\u00e2\u20ac\u201c|\u00e2\u0080\u0094|\u00e2\u0080\u0093/g,
    "—",
  );
}

const bookingClockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Yangon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function bookingClock(now = new Date()) {
  const parts = bookingClockFormatter.formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minute: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

export function bookingStart(time: string) {
  const start = normalizeBookingTime(time).split(/\s*(?:—|–|-|to)\s*/i)[0];
  const match = start.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return NaN;
  const hour = Number(match[1]),
    minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return NaN;
  return (
    (match[3]
      ? (hour % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0)
      : hour) *
      60 +
    minute
  );
}

export function bookingHasStarted(
  date: string,
  time: string,
  now = bookingClock(),
) {
  return (
    date < now.date || (date === now.date && bookingStart(time) <= now.minute)
  );
}
