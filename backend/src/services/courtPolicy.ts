import { randomBytes } from "node:crypto";
export const timeZone = process.env.BUSINESS_TIME_ZONE || "Asia/Yangon";
export const openingMinute = 360;
export const closingMinute = 1260;
export function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function businessNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return {
    hour: Number(parts.find((p) => p.type === "hour")!.value),
    minute: Number(parts.find((p) => p.type === "minute")!.value),
  };
}
export function toMinute(value: string) {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] > 59) return NaN;
  return (+m[1] % 12) * 60 + +m[2] + (m[3].toUpperCase() === "PM" ? 720 : 0);
}
export function range(value: string) {
  const parts = value.split(/\s*(?:—|–|-|to)\s*/i);
  if (parts.length !== 2) return null;
  const start = toMinute(parts[0]),
    end = toMinute(parts[1]);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end }
    : null;
}
export const clock = (minute: number) =>
  `${Math.floor(minute / 60) % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${minute >= 720 ? "PM" : "AM"}`;
export const formatRange = (start: number, end: number) =>
  `${clock(start)} — ${clock(end)}`;
export const overlaps = (a: string, b: string) => {
  const x = range(a),
    y = range(b);
  return !!x && !!y && x.start < y.end && y.start < x.end;
};
export const code = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
