import { todayKey } from "./dates";
import { shouldShowMonthEndPrompt, shouldShowSundayReviewPrompt } from "./reviews";
import type { PlannerData } from "./types";

export type ReminderBanner = {
  id: string;
  title: string;
  body: string;
  kind: "morning" | "evening" | "sunday" | "month_end";
};

function currentTimeHHMM(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function timeReached(now: Date, configured: string): boolean {
  return currentTimeHHMM(now) >= configured;
}

const DISMISS_PREFIX = "humanos_reminder_dismissed_";

export function dismissReminder(kind: string, date: string): void {
  sessionStorage.setItem(`${DISMISS_PREFIX}${kind}`, date);
}

export function isReminderDismissed(kind: string, date: string): boolean {
  return sessionStorage.getItem(`${DISMISS_PREFIX}${kind}`) === date;
}

/** In-app reminders only — fire when the app is open past the configured time. */
export function getActiveReminders(data: PlannerData, now = new Date()): ReminderBanner[] {
  const today = todayKey(now);
  const r = data.settings.reminders;
  const banners: ReminderBanner[] = [];

  if (
    r.morningEnabled &&
    timeReached(now, r.morningTime) &&
    !isReminderDismissed("morning", today)
  ) {
    banners.push({
      id: "morning",
      title: "Morning — today's tasks",
      body: "Review your tasks for today and start with the most important action.",
      kind: "morning"
    });
  }

  if (
    r.eveningEnabled &&
    timeReached(now, r.eveningTime) &&
    !isReminderDismissed("evening", today)
  ) {
    banners.push({
      id: "evening",
      title: "Evening check-in (2 min)",
      body: "Log energy, mood, a one-line summary, and plan tomorrow.",
      kind: "evening"
    });
  }

  if (
    shouldShowSundayReviewPrompt(data, now) &&
    timeReached(now, r.sundayReviewTime) &&
    !isReminderDismissed("sunday", today)
  ) {
    banners.push({
      id: "sunday",
      title: "Sunday weekly review",
      body: "Reflect on the week and plan the next one.",
      kind: "sunday"
    });
  }

  if (
    shouldShowMonthEndPrompt(data, now) &&
    timeReached(now, r.monthEndTime) &&
    !isReminderDismissed("month_end", today)
  ) {
    banners.push({
      id: "month_end",
      title: "Monthly planning",
      body: "Last days of the month — set next month's goal and daily actions.",
      kind: "month_end"
    });
  }

  return banners;
}
