import { addDays, eachDateInclusive, isBefore, todayKey } from "./dates";
import { daySucceeded, getTasksForDate, isRestDay } from "./tasks";
import type { PlannerData, SkipReason } from "./types";

export type StreakStats = {
  current: number;
  longest: number;
  yesterdayMissed: boolean;
  neverMissTwice: boolean;
};

export function computeStreakStats(data: PlannerData, now = new Date()): StreakStats {
  const today = todayKey(now);
  const earliestTask = data.tasks.reduce<string | null>((min, task) => {
    if (!min || task.date < min) {
      return task.date;
    }
    return min;
  }, null);

  if (!earliestTask) {
    return { current: 0, longest: 0, yesterdayMissed: false, neverMissTwice: false };
  }

  const dates = eachDateInclusive(earliestTask, addDays(today, -1));
  const results: Array<{ date: string; success: boolean | null }> = dates.map((date) => ({
    date,
    success: daySucceeded(data, date)
  }));

  let longest = 0;
  let run = 0;
  for (const day of results) {
    if (day.success === null) {
      continue; // rest day or no tasks — invisible
    }
    if (day.success) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const day = results[i];
    if (!day) {
      break;
    }
    if (day.success === null) {
      continue;
    }
    if (day.success) {
      current += 1;
    } else {
      break;
    }
  }

  const yesterday = addDays(today, -1);
  const yesterdayResult = daySucceeded(data, yesterday);
  const yesterdayMissed = yesterdayResult === false;
  const neverMissTwice = yesterdayMissed;

  return { current, longest, yesterdayMissed, neverMissTwice };
}

export type HeatmapDay = {
  date: string;
  percent: number;
  isRestDay: boolean;
  hasTasks: boolean;
};

export function buildHeatmap(
  data: PlannerData,
  start: string,
  end: string
): HeatmapDay[] {
  return eachDateInclusive(start, end).map((date) => {
    const rest = isRestDay(data, date);
    const tasks = getTasksForDate(data, date);
    if (rest) {
      return { date, percent: -1, isRestDay: true, hasTasks: tasks.length > 0 };
    }
    if (tasks.length === 0) {
      return { date, percent: 0, isRestDay: false, hasTasks: false };
    }
    const countable = tasks.filter((t) => t.status !== "moved");
    const success = countable.filter(
      (t) => t.status === "done" || t.status === "minimum_done"
    ).length;
    const percent = Math.round((success / countable.length) * 100);
    return { date, percent, isRestDay: false, hasTasks: true };
  });
}

export type SkipReasonCount = { reason: SkipReason; count: number };

export function skipReasonAnalytics(data: PlannerData): SkipReasonCount[] {
  const counts: Record<SkipReason, number> = {
    tired: 0,
    busy: 0,
    sick: 0,
    unmotivated: 0,
    other: 0
  };

  for (const task of data.tasks) {
    if (task.status !== "skipped" || !task.skipReason) {
      continue;
    }
    // Exclude legacy import noise from charts
    if (task.legacy) {
      continue;
    }
    counts[task.skipReason] += 1;
  }

  return (Object.keys(counts) as SkipReason[])
    .map((reason) => ({ reason, count: counts[reason] }))
    .sort((a, b) => b.count - a.count);
}

export type EnergyCompletionPoint = {
  date: string;
  energy: number;
  completionPercent: number;
};

export function energyVsCompletion(data: PlannerData): EnergyCompletionPoint[] {
  const points: EnergyCompletionPoint[] = [];

  for (const log of data.dailyLogs) {
    if (log.energy === null || log.isRestDay) {
      continue;
    }
    const tasks = getTasksForDate(data, log.date);
    if (tasks.length === 0) {
      continue;
    }
    const countable = tasks.filter((t) => t.status !== "moved");
    const success = countable.filter(
      (t) => t.status === "done" || t.status === "minimum_done"
    ).length;
    points.push({
      date: log.date,
      energy: log.energy,
      completionPercent: Math.round((success / countable.length) * 100)
    });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export function correlationEnergyCompletion(points: EnergyCompletionPoint[]): number | null {
  if (points.length < 2) {
    return null;
  }
  const n = points.length;
  const xs = points.map((p) => p.energy);
  const ys = points.map((p) => p.completionPercent);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - meanX;
    const dy = (ys[i] ?? 0) - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) {
    return null;
  }
  return Math.round((num / Math.sqrt(denX * denY)) * 100) / 100;
}

export function dailyCompletionRate(data: PlannerData, date: string): number {
  if (isRestDay(data, date)) {
    return 100;
  }
  const tasks = getTasksForDate(data, date);
  if (tasks.length === 0) {
    return 0;
  }
  const countable = tasks.filter((t) => t.status !== "moved");
  const success = countable.filter(
    (t) => t.status === "done" || t.status === "minimum_done"
  ).length;
  return Math.round((success / countable.length) * 100);
}

export function wasMissed(data: PlannerData, date: string, now = new Date()): boolean {
  if (!isBefore(date, todayKey(now))) {
    return false;
  }
  return daySucceeded(data, date) === false;
}
