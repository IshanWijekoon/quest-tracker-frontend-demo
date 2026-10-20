import { addDays, dayOfWeek, eachDateInclusive, formatDateKey, todayKey } from "./dates";
import { createId } from "./planner-store";
import { daySucceeded, getTasksForDate } from "./tasks";
import type { PlannerData, Review, ReviewType, SkipReason } from "./types";

export type WeeklyPrefill = {
  periodStart: string;
  periodEnd: string;
  daysCompleted: string[];
  daysMissed: string[];
  daysRest: string[];
  skipReasons: Array<{ reason: SkipReason; count: number }>;
  completionByDay: Array<{ date: string; completed: number; total: number }>;
};

export function getWeekBounds(dateKey: string, weekStartsOn: 0 | 1 = 0): {
  start: string;
  end: string;
} {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  const dow = date.getDay();
  const offset = weekStartsOn === 0 ? dow : (dow + 6) % 7;
  date.setDate(date.getDate() - offset);
  const start = formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
  const end = addDays(start, 6);
  return { start, end };
}

export function prefillWeeklyReview(data: PlannerData, now = new Date()): WeeklyPrefill {
  const today = todayKey(now);
  const { start, end } = getWeekBounds(today, data.settings.weekStartsOn);
  const days = eachDateInclusive(start, end);

  const daysCompleted: string[] = [];
  const daysMissed: string[] = [];
  const daysRest: string[] = [];
  const completionByDay: WeeklyPrefill["completionByDay"] = [];
  const reasonCounts: Record<SkipReason, number> = {
    tired: 0,
    busy: 0,
    sick: 0,
    unmotivated: 0,
    other: 0
  };

  for (const date of days) {
    const log = data.dailyLogs.find((l) => l.date === date);
    if (log?.isRestDay) {
      daysRest.push(date);
      completionByDay.push({ date, completed: 0, total: 0 });
      continue;
    }

    const tasks = getTasksForDate(data, date);
    const countable = tasks.filter((t) => t.status !== "moved");
    const completed = countable.filter(
      (t) => t.status === "done" || t.status === "minimum_done"
    ).length;
    completionByDay.push({ date, completed, total: countable.length });

    const result = daySucceeded(data, date);
    if (result === true) {
      daysCompleted.push(date);
    } else if (result === false) {
      daysMissed.push(date);
    }

    for (const task of countable) {
      if (task.status === "skipped" && task.skipReason && !task.legacy) {
        reasonCounts[task.skipReason] += 1;
      }
    }
  }

  const skipReasons = (Object.keys(reasonCounts) as SkipReason[])
    .map((reason) => ({ reason, count: reasonCounts[reason] }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    periodStart: start,
    periodEnd: end,
    daysCompleted,
    daysMissed,
    daysRest,
    skipReasons,
    completionByDay
  };
}

export function saveReview(
  data: PlannerData,
  input: {
    type: ReviewType;
    periodStart: string;
    periodEnd: string;
    answers: Record<string, unknown>;
  },
  now = new Date()
): PlannerData {
  const review: Review = {
    id: createId("review"),
    type: input.type,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    answers: input.answers,
    createdAt: now.toISOString()
  };
  return { ...data, reviews: [...data.reviews, review] };
}

export function getReviews(data: PlannerData, type?: ReviewType): Review[] {
  return data.reviews
    .filter((r) => (type ? r.type === type : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getReviewById(data: PlannerData, id: string): Review | undefined {
  return data.reviews.find((r) => r.id === id);
}

export type MonthGoalResult = {
  goalId: string;
  title: string;
  progressPercent: number;
  status: string;
};

export function isSunday(dateKey: string): boolean {
  return dayOfWeek(dateKey) === 0;
}

export function isInLastThreeDaysOfMonth(dateKey: string): boolean {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) {
    return false;
  }
  const daysInMonth = new Date(y, m, 0).getDate();
  return d > daysInMonth - 3;
}

export function shouldShowSundayReviewPrompt(data: PlannerData, now = new Date()): boolean {
  if (!data.settings.reminders.sundayReviewEnabled) {
    return false;
  }
  const today = todayKey(now);
  if (!isSunday(today)) {
    return false;
  }
  const { start, end } = getWeekBounds(today, data.settings.weekStartsOn);
  return !data.reviews.some(
    (r) => r.type === "weekly" && r.periodStart === start && r.periodEnd === end
  );
}

export function shouldShowMonthEndPrompt(data: PlannerData, now = new Date()): boolean {
  if (!data.settings.reminders.monthEndEnabled) {
    return false;
  }
  const today = todayKey(now);
  if (!isInLastThreeDaysOfMonth(today)) {
    return false;
  }
  const monthPrefix = today.slice(0, 7);
  return !data.reviews.some(
    (r) => r.type === "monthly" && r.periodStart.startsWith(monthPrefix)
  );
}

/** Monthly review requires next month goal + at least one template to finish. */
export function canCompleteMonthlyReview(
  data: PlannerData,
  nextMonthGoalId: string | null,
  nextTemplateIds: string[]
): boolean {
  if (!nextMonthGoalId) {
    return false;
  }
  const goal = data.goals.find((g) => g.id === nextMonthGoalId && g.level === "month");
  if (!goal || goal.status === "dropped") {
    return false;
  }
  if (nextTemplateIds.length === 0) {
    return false;
  }
  return nextTemplateIds.every((id) => data.templates.some((t) => t.id === id));
}
