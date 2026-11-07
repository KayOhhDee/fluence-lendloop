import { ConvexError } from "convex/values";
import { CATEGORIES, CONDITIONS, type Category, type Condition } from "@/convex/lib/domain";

export function categoryLabel(value: Category): string {
  return CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

export function conditionLabel(value: Condition): string {
  return CONDITIONS.find((condition) => condition.value === value)?.label ?? value;
}

export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatRange(startDate: string, endDate: string): string {
  return startDate === endDate ? formatDay(startDate) : `${formatDay(startDate)} – ${formatDay(endDate)}`;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function timeAgo(timestamp: number): string {
  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/** Local calendar day as YYYY-MM-DD, for date input defaults and minimums. */
export function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Only errors the backend raised on purpose are shown to people; anything else stays generic. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data?.message === "string") return error.data.message;
  return "Something went wrong. Please try again.";
}
