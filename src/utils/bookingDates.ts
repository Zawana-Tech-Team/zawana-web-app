export type BookingDatePreset = "today" | "yesterday" | "upcoming" | "all";

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shiftDateKey(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return localDateKey(date);
}

export function formatBookingDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }, locale = document.documentElement.lang === 'my' ? 'my-MM' : 'en-US'): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, options).format(new Date(year, month - 1, day));
}
