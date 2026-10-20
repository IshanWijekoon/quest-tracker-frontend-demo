import {
  firstDayOfMonth,
  formatDateKey,
  formatMonthKey,
  isBefore,
  lastDayOfMonth,
  localNoonTimestamp,
  todayKey
} from "./dates";
import {
  backupHabitsDataIfNeeded,
  createEmptyPlannerData,
  createId,
  hashString,
  loadPlannerData,
  loadPlannerMeta,
  PLANNER_META_KEY,
  PLANNER_STORAGE_KEY,
  readHabitsRaw,
  savePlannerData,
  savePlannerMeta
} from "./planner-store";
import type {
  HabitsData,
  HabitLog,
  MonthData,
  PlannerData,
  PlannerMeta,
  PlannerTask,
  TaskTemplate
} from "./types";

export type MigrationResult = {
  ok: true;
  data: PlannerData;
  meta: PlannerMeta;
  alreadyMigrated: boolean;
} | {
  ok: false;
  reason: "no_source" | "reset_required";
  message: string;
};

type NameGroup = {
  normalizedName: string;
  displayName: string;
  color: string;
  months: string[];
  latestMonthKey: string;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function parseMonthKey(monthKey: string): { year: number; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || !month || month < 1 || month > 12) {
    return null;
  }
  return { year, monthIndex: month - 1 };
}

function cellValue(
  log: HabitLog,
  dateKey: string,
  habitId: string
): "check" | "cross" | "blank" {
  const val = log[dateKey]?.[habitId];
  if (val === true || val === "check") {
    return "check";
  }
  if (val === "cross") {
    return "cross";
  }
  return "blank";
}

function sortMonthKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

function buildNameGroups(habitsData: HabitsData): NameGroup[] {
  const map = new Map<string, NameGroup>();

  for (const [monthKey, monthData] of Object.entries(habitsData.months ?? {})) {
    if (!monthData || !Array.isArray(monthData.habits)) {
      continue;
    }

    for (const habit of monthData.habits) {
      const normalized = normalizeName(habit.name ?? "");
      if (!normalized) {
        continue;
      }

      const existing = map.get(normalized);
      if (!existing) {
        map.set(normalized, {
          normalizedName: normalized,
          displayName: habit.name.trim(),
          color: habit.color || "#6db6ff",
          months: [monthKey],
          latestMonthKey: monthKey
        });
        continue;
      }

      existing.months.push(monthKey);
      if (monthKey >= existing.latestMonthKey) {
        existing.latestMonthKey = monthKey;
        existing.displayName = habit.name.trim();
        existing.color = habit.color || existing.color;
      }
    }
  }

  return Array.from(map.values());
}

function isNameInMonth(habitsData: HabitsData, monthKey: string, normalizedName: string): boolean {
  const monthData = habitsData.months[monthKey];
  if (!monthData) {
    return false;
  }
  return monthData.habits.some((h) => normalizeName(h.name) === normalizedName);
}

export function buildTemplatesFromHabits(
  habitsData: HabitsData,
  now = new Date()
): TaskTemplate[] {
  const groups = buildNameGroups(habitsData);
  const currentMonthKey = formatMonthKey(now.getFullYear(), now.getMonth());
  const createdAt = now.toISOString();
  const templates: TaskTemplate[] = [];

  for (const group of groups) {
    const months = sortMonthKeys([...new Set(group.months)]);
    const earliest = months[0];
    const latest = months[months.length - 1];
    if (!earliest || !latest) {
      continue;
    }

    const earliestParsed = parseMonthKey(earliest);
    const latestParsed = parseMonthKey(latest);
    if (!earliestParsed || !latestParsed) {
      continue;
    }

    const inCurrentMonth = isNameInMonth(habitsData, currentMonthKey, group.normalizedName);
    const startDate = firstDayOfMonth(earliestParsed.year, earliestParsed.monthIndex);
    const endDate = inCurrentMonth
      ? null
      : lastDayOfMonth(latestParsed.year, latestParsed.monthIndex);

    const startsInFuture = startDate > todayKey(now);

    templates.push({
      id: createId("tmpl"),
      title: group.displayName,
      goalId: null,
      plannedMinutes: null,
      minimumVersion: "",
      recurrence: { kind: "daily" },
      startDate,
      endDate,
      active: inCurrentMonth || startsInFuture,
      color: group.color,
      createdAt,
      updatedAt: createdAt
    });
  }

  return templates;
}

export function buildTasksFromHabits(
  habitsData: HabitsData,
  templates: TaskTemplate[],
  now = new Date()
): PlannerTask[] {
  const today = todayKey(now);
  const templateByName = new Map(
    templates.map((t) => [normalizeName(t.title), t] as const)
  );
  const tasks: PlannerTask[] = [];
  const createdAt = now.toISOString();

  for (const [monthKey, monthData] of Object.entries(habitsData.months ?? {})) {
    const parsed = parseMonthKey(monthKey);
    if (!parsed || !monthData) {
      continue;
    }

    const daysInMonth = new Date(parsed.year, parsed.monthIndex + 1, 0).getDate();

    for (const habit of monthData.habits ?? []) {
      const template = templateByName.get(normalizeName(habit.name));
      if (!template) {
        continue;
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = formatDateKey(parsed.year, parsed.monthIndex, day);
        if (!isBefore(dateKey, today)) {
          continue;
        }

        const cell = cellValue(monthData.log ?? {}, dateKey, habit.id);
        const status = cell === "check" ? "done" : "skipped";

        const task: PlannerTask = {
          id: createId("task"),
          date: dateKey,
          title: template.title,
          goalId: null,
          plannedMinutes: null,
          minimumVersion: "",
          status,
          completedAt: status === "done" ? localNoonTimestamp(dateKey) : null,
          note: "",
          skipReason: status === "skipped" ? "other" : null,
          templateId: template.id,
          sortOrder: 0,
          movedToDate: null,
          legacy: {
            habitId: habit.id,
            monthKey,
            cell
          },
          createdAt
        };

        tasks.push(task);
      }
    }
  }

  return tasks;
}

/** Pure: convert HabitsData → PlannerData without touching storage. */
export function migrateHabitsToPlanner(
  habitsData: HabitsData,
  sourceRaw: string,
  now = new Date()
): PlannerData {
  const hash = hashString(sourceRaw);
  const templates = buildTemplatesFromHabits(habitsData, now);
  const tasks = buildTasksFromHabits(habitsData, templates, now);

  const data = createEmptyPlannerData(hash);
  data.templates = templates;
  data.tasks = tasks;
  return data;
}

export function computeLegacyDaySuccess(
  monthData: MonthData,
  dateKey: string
): boolean | null {
  if (!monthData.habits.length) {
    return null;
  }

  return monthData.habits.every((habit) => {
    const val = monthData.log[dateKey]?.[habit.id];
    return val === true || val === "check";
  });
}

export type StreakInfo = {
  current: number;
  longest: number;
  successfulDays: string[];
};

/** All-checked rule on raw habits data. Days with no quests are ignored. */
export function computeLegacyStreak(habitsData: HabitsData, now = new Date()): StreakInfo {
  const today = todayKey(now);
  const dayResults: Array<{ date: string; success: boolean }> = [];

  const monthKeys = sortMonthKeys(Object.keys(habitsData.months ?? {}));
  for (const monthKey of monthKeys) {
    const parsed = parseMonthKey(monthKey);
    const monthData = habitsData.months[monthKey];
    if (!parsed || !monthData || monthData.habits.length === 0) {
      continue;
    }

    const daysInMonth = new Date(parsed.year, parsed.monthIndex + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = formatDateKey(parsed.year, parsed.monthIndex, day);
      if (!isBefore(dateKey, today) && dateKey !== today) {
        continue;
      }
      // Only evaluate past days for historical streak parity (today may be incomplete)
      if (!isBefore(dateKey, today)) {
        continue;
      }

      const success = computeLegacyDaySuccess(monthData, dateKey);
      if (success === null) {
        continue;
      }
      dayResults.push({ date: dateKey, success });
    }
  }

  dayResults.sort((a, b) => a.date.localeCompare(b.date));

  let longest = 0;
  let run = 0;
  const successfulDays: string[] = [];

  for (const day of dayResults) {
    if (day.success) {
      run += 1;
      longest = Math.max(longest, run);
      successfulDays.push(day.date);
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = dayResults.length - 1; i >= 0; i -= 1) {
    const day = dayResults[i];
    if (!day) {
      break;
    }
    if (day.success) {
      current += 1;
    } else {
      break;
    }
  }

  return { current, longest, successfulDays };
}

/** Same all-checked rule on migrated planner tasks (past days only). */
export function computePlannerHistoricalStreak(
  data: PlannerData,
  now = new Date()
): StreakInfo {
  const today = todayKey(now);
  const byDate = new Map<string, PlannerTask[]>();

  for (const task of data.tasks) {
    if (!isBefore(task.date, today)) {
      continue;
    }
    if (task.legacy === null && task.status === "moved") {
      continue;
    }
    const list = byDate.get(task.date) ?? [];
    list.push(task);
    byDate.set(task.date, list);
  }

  const dates = [...byDate.keys()].sort();
  const dayResults: Array<{ date: string; success: boolean }> = [];

  for (const date of dates) {
    const tasks = byDate.get(date) ?? [];
    if (tasks.length === 0) {
      continue;
    }
    const success = tasks.every((t) => t.status === "done" || t.status === "minimum_done");
    dayResults.push({ date, success });
  }

  let longest = 0;
  let run = 0;
  const successfulDays: string[] = [];

  for (const day of dayResults) {
    if (day.success) {
      run += 1;
      longest = Math.max(longest, run);
      successfulDays.push(day.date);
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = dayResults.length - 1; i >= 0; i -= 1) {
    const day = dayResults[i];
    if (!day) {
      break;
    }
    if (day.success) {
      current += 1;
    } else {
      break;
    }
  }

  return { current, longest, successfulDays };
}

function parseHabitsData(raw: string): HabitsData | null {
  try {
    const parsed = JSON.parse(raw) as HabitsData;
    if (!parsed || typeof parsed.months !== "object" || parsed.months === null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Idempotent migration into localStorage.
 * Does not mutate humanos_habits_v3.
 * Pass forceReset=true to wipe planner and re-migrate.
 */
export function runMigration(options?: {
  forceReset?: boolean;
  now?: Date;
}): MigrationResult {
  const now = options?.now ?? new Date();
  const forceReset = options?.forceReset ?? false;

  if (forceReset) {
    localStorage.removeItem(PLANNER_STORAGE_KEY);
    localStorage.removeItem(PLANNER_META_KEY);
  }

  const existing = loadPlannerData();
  const existingMeta = loadPlannerMeta();

  if (existing && existingMeta && !forceReset) {
    return {
      ok: true,
      data: existing,
      meta: existingMeta,
      alreadyMigrated: true
    };
  }

  const raw = readHabitsRaw();
  if (!raw) {
    const empty = createEmptyPlannerData(null);
    const meta: PlannerMeta = {
      mode: "planner",
      migratedFromHash: null,
      migratedAt: now.toISOString(),
      templateCount: 0,
      taskCount: 0
    };
    savePlannerData(empty);
    savePlannerMeta(meta);
    return { ok: true, data: empty, meta, alreadyMigrated: false };
  }

  const habitsData = parseHabitsData(raw);
  if (!habitsData) {
    return {
      ok: false,
      reason: "no_source",
      message: "Could not parse habits data."
    };
  }

  backupHabitsDataIfNeeded();

  // Deep clone so migration never mutates the caller's / stored object via reference
  const clone = JSON.parse(JSON.stringify(habitsData)) as HabitsData;
  const data = migrateHabitsToPlanner(clone, raw, now);
  const meta: PlannerMeta = {
    mode: "planner",
    migratedFromHash: data.migratedFromHash,
    migratedAt: now.toISOString(),
    templateCount: data.templates.length,
    taskCount: data.tasks.length
  };

  savePlannerData(data);
  savePlannerMeta(meta);

  return { ok: true, data, meta, alreadyMigrated: false };
}

export function rollbackToLegacy(): PlannerMeta {
  const existing = loadPlannerMeta();
  const meta: PlannerMeta = existing
    ? { ...existing, mode: "legacy" }
    : {
        mode: "legacy",
        migratedFromHash: null,
        migratedAt: null,
        templateCount: 0,
        taskCount: 0
      };
  savePlannerMeta(meta);
  return meta;
}

export function switchToPlanner(): PlannerMeta {
  const existing = loadPlannerMeta();
  if (!existing || !loadPlannerData()) {
    const result = runMigration();
    if (result.ok) {
      return { ...result.meta, mode: "planner" };
    }
  }
  const meta: PlannerMeta = existing
    ? { ...existing, mode: "planner" }
    : {
        mode: "planner",
        migratedFromHash: null,
        migratedAt: null,
        templateCount: 0,
        taskCount: 0
      };
  savePlannerMeta(meta);
  return meta;
}
