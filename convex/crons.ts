import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("redeliver stranded notifications", { minutes: 5 }, internal.notifications.sweep);

// Well after the 08:00 UTC n8n schedule, so a healthy run has already checked in.
crons.daily(
  "check overdue reminder workflow ran",
  { hourUTC: 12, minuteUTC: 0 },
  internal.automation.checkOverdueRunWatchdog,
);

export default crons;
