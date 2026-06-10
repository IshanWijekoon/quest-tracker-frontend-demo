import { CellState, Habit, HabitLog, MonthData, HabitsData } from "./types";

const STORAGE_KEY = "humanos_habits_v3";
const LEGACY_V2_KEY = "humanos_habits_v2";
const LEGACY_V1_KEY = "humanos_habits";
const MAX_HABITS = 10;

const DEFAULT_HABITS: Habit[] = [
  { id: "habit-exercise", name: "Exercise", color: "#f9d66d" },
  { id: "habit-coding", name: "Coding", color: "#6db6ff" },
  { id: "habit-reading", name: "Reading", color: "#8ee48e" }
];

const HABIT_COLORS = [
  "#f9d66d",
  "#6db6ff",
  "#8ee48e",
  "#f29ec2",
  "#c8b6ff",
  "#84dcc6",
  "#ffa69e",
  "#b8f2e6",
  "#b7b7a4",
  "#a0c4ff"
];

export type MonthStats = {
  todayCompleted: number;
  currentWeekCompleted: number;
  currentMonthCompleted: number;
  weeklyCompleted: number[];
  weeklyPossible: number[];
  weeklyPercent: number[];
  monthlyPossible: number;
  monthlyPercent: number;
  weekCount: number;
  currentWeekIndex: number;
};

export function formatMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function getDefaultMonthData(): MonthData {
  return {
    habits: [...DEFAULT_HABITS],
    log: {}
  };
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

type LegacyV2Data = {
  habits: Habit[];
  log: HabitLog;
};

type PartialMonthData = {
  habits?: Habit[];
  log?: HabitLog;
};

type LegacyV1Habit = {
  id: string;
  name: string;
  streak: number;
  completedToday: boolean;
};

function migrateFromV2(): HabitsData | null {
  const v2 = safeJsonParse<LegacyV2Data>(localStorage.getItem(LEGACY_V2_KEY));
  if (!v2 || !Array.isArray(v2.habits) || v2.habits.length === 0) {
    return null;
  }

  const habits: Habit[] = v2.habits.slice(0, MAX_HABITS).map((h, i) => ({
    id: h.id,
    name: h.name?.trim() || `Habit ${i + 1}`,
    color: h.color || HABIT_COLORS[i % HABIT_COLORS.length]
  }));

  const months: Record<string, MonthData> = {};

  if (v2.log && typeof v2.log === "object") {
    Object.entries(v2.log).forEach(([dateKey, dayValues]) => {
      if (!dayValues || typeof dayValues !== "object") {
        return;
      }

      const parts = dateKey.split("-");
      if (parts.length < 2) {
        return;
      }

      const monthKey = `${parts[0]}-${parts[1]}`;

      if (!months[monthKey]) {
        months[monthKey] = { habits: [...habits], log: {} };
      }

      const entries: Record<string, boolean> = {};
      Object.entries(dayValues).forEach(([habitId, completed]) => {
        entries[habitId] = Boolean(completed);
      });

      months[monthKey].log[dateKey] = entries;
    });
  }

  if (Object.keys(months).length === 0) {
    const now = new Date();
    const currentKey = formatMonthKey(now.getFullYear(), now.getMonth());
    months[currentKey] = { habits, log: {} };
  }

  return { months, sideQuests: [], manMilestones: [] };
}

function migrateFromV1(): HabitsData | null {
  const legacy = safeJsonParse<LegacyV1Habit[]>(localStorage.getItem(LEGACY_V1_KEY));
  if (!legacy || !Array.isArray(legacy) || legacy.length === 0) {
    return null;
  }

  const habits: Habit[] = legacy.slice(0, MAX_HABITS).map((h, i) => ({
    id: h.id,
    name: h.name,
    color: HABIT_COLORS[i % HABIT_COLORS.length]
  }));

  const now = new Date();
  const currentKey = formatMonthKey(now.getFullYear(), now.getMonth());

  return {
    months: {
      [currentKey]: { habits, log: {} }
    },
    sideQuests: [],
    manMilestones: []
  };
}

export function saveHabitsData(data: HabitsData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function ensureGlobalLists(d: HabitsData): HabitsData {
  return {
    months: d.months,
    sideQuests: Array.isArray(d.sideQuests) ? d.sideQuests : [],
    manMilestones: Array.isArray(d.manMilestones) ? d.manMilestones : []
  };
}

export function loadHabitsData(): HabitsData {
  const v3 = safeJsonParse<HabitsData>(localStorage.getItem(STORAGE_KEY));
  if (v3 && v3.months && typeof v3.months === "object") {
    return ensureGlobalLists(v3);
  }

  const fromV2 = migrateFromV2();
  if (fromV2) {
    const normalized = ensureGlobalLists(fromV2);
    saveHabitsData(normalized);
    return normalized;
  }

  const fromV1 = migrateFromV1();
  if (fromV1) {
    const normalized = ensureGlobalLists(fromV1);
    saveHabitsData(normalized);
    return normalized;
  }

  const now = new Date();
  const currentKey = formatMonthKey(now.getFullYear(), now.getMonth());
  const defaults: HabitsData = {
    months: {
      [currentKey]: getDefaultMonthData()
    },
    sideQuests: [],
    manMilestones: []
  };

  saveHabitsData(defaults);
  return defaults;
}

function normalizeMonthData(monthData: PartialMonthData | undefined): MonthData {
  if (!monthData) {
    return getDefaultMonthData();
  }

  return {
    habits: Array.isArray(monthData.habits) ? monthData.habits : [],
    log: monthData.log && typeof monthData.log === "object" ? monthData.log : {}
  };
}

export function getMonthData(data: HabitsData, year: number, monthIndex: number): MonthData {
  const key = formatMonthKey(year, monthIndex);
  return normalizeMonthData(data.months[key]);
}

export function setMonthData(data: HabitsData, year: number, monthIndex: number, monthData: MonthData): HabitsData {
  const key = formatMonthKey(year, monthIndex);
  return {
    ...data,
    months: {
      ...data.months,
      [key]: monthData
    }
  };
}

export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function formatDateKey(year: number, monthIndex: number, day: number): string {
  const month = String(monthIndex + 1).padStart(2, "0");
  const dateDay = String(day).padStart(2, "0");
  return `${year}-${month}-${dateDay}`;
}

export function isHabitCompletedOnDate(
  monthData: MonthData,
  habitId: string,
  dateKey: string
): boolean {
  const val = monthData.log[dateKey]?.[habitId];
  return val === true || val === "check";
}

export function getCellState(
  monthData: MonthData,
  habitId: string,
  dateKey: string
): CellState | null {
  const val = monthData.log[dateKey]?.[habitId];
  if (val === "check" || val === true) return "check";
  if (val === "cross") return "cross";
  return null;
}

export function toggleHabitDay(data: HabitsData, year: number, monthIndex: number, habitId: string, dateKey: string): HabitsData {
  const monthData = getMonthData(data, year, monthIndex);
  const currentState = getCellState(monthData, habitId, dateKey);

  const dailyEntry = { ...(monthData.log[dateKey] ?? {}) };

  if (currentState === "check") {
    delete dailyEntry[habitId];
  } else {
    dailyEntry[habitId] = "check" as CellState;
  }

  const nextMonthData: MonthData = {
    habits: [...monthData.habits],
    log: { ...monthData.log, [dateKey]: dailyEntry }
  };

  return setMonthData(data, year, monthIndex, nextMonthData);
}

export function setCellState(data: HabitsData, year: number, monthIndex: number, habitId: string, dateKey: string, state: CellState | null): HabitsData {
  const monthData = getMonthData(data, year, monthIndex);

  const dailyEntry = { ...(monthData.log[dateKey] ?? {}) };

  if (state === null) {
    delete dailyEntry[habitId];
  } else {
    dailyEntry[habitId] = state;
  }

  const nextMonthData: MonthData = {
    habits: [...monthData.habits],
    log: { ...monthData.log, [dateKey]: dailyEntry }
  };

  return setMonthData(data, year, monthIndex, nextMonthData);
}

export function addHabit(data: HabitsData, year: number, monthIndex: number, name: string, color: string): HabitsData {
  const monthData = getMonthData(data, year, monthIndex);
  const trimmedName = name.trim();

  if (!trimmedName || monthData.habits.length >= MAX_HABITS) {
    return data;
  }

  const id = `habit-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;

  const nextMonthData: MonthData = {
    habits: [...monthData.habits, { id, name: trimmedName, color }],
    log: { ...monthData.log }
  };

  return setMonthData(data, year, monthIndex, nextMonthData);
}

export function removeHabit(data: HabitsData, year: number, monthIndex: number, habitId: string): HabitsData {
  const monthData = getMonthData(data, year, monthIndex);
  const habits = monthData.habits.filter((h) => h.id !== habitId);

  if (habits.length === monthData.habits.length) {
    return data;
  }

  const log: HabitLog = {};
  Object.entries(monthData.log).forEach(([dateKey, values]) => {
    const { [habitId]: _removed, ...rest } = values;
    if (Object.keys(rest).length > 0) {
      log[dateKey] = rest;
    }
  });

  return setMonthData(data, year, monthIndex, { habits, log });
}

export function renameHabit(data: HabitsData, year: number, monthIndex: number, habitId: string, name: string): HabitsData {
  const monthData = getMonthData(data, year, monthIndex);
  const trimmedName = name.trim();

  if (!trimmedName) {
    return data;
  }

  const habits = monthData.habits.map((h) =>
    h.id === habitId ? { ...h, name: trimmedName } : h
  );

  return setMonthData(data, year, monthIndex, { habits, log: { ...monthData.log } });
}

export function clearMonthHabits(data: HabitsData, year: number, monthIndex: number): HabitsData {
  return setMonthData(data, year, monthIndex, { habits: [], log: {} });
}

export function getColorByIndex(index: number): string {
  return HABIT_COLORS[index % HABIT_COLORS.length];
}

export function calculateStats(monthData: MonthData, year: number, monthIndex: number): MonthStats {
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const weekCount = Math.ceil(daysInMonth / 7);
  const weeklyCompleted = Array.from({ length: weekCount }, () => 0);
  const weeklyPossible = Array.from({ length: weekCount }, () => 0);
  const habitCount = monthData.habits.length;
  let currentMonthCompleted = 0;
  let todayCompleted = 0;

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === monthIndex;
  const currentDay = isCurrentMonth ? today.getDate() : 1;
  const currentWeekIndex = Math.floor((currentDay - 1) / 7);
  const todayKey = formatDateKey(year, monthIndex, currentDay);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateKey(year, monthIndex, day);
    const weekIndex = Math.floor((day - 1) / 7);
    weeklyPossible[weekIndex] += habitCount;

    monthData.habits.forEach((habit) => {
      const val = monthData.log[dateKey]?.[habit.id];
      const isCompleted = val === true || val === "check";
      if (!isCompleted) {
        return;
      }

      currentMonthCompleted += 1;
      weeklyCompleted[weekIndex] += 1;

      if (dateKey === todayKey) {
        todayCompleted += 1;
      }
    });
  }

  const monthlyPossible = daysInMonth * habitCount;
  const weeklyPercent = weeklyCompleted.map((count, index) => {
    const possible = weeklyPossible[index] || 1;
    return Math.round((count / possible) * 100);
  });
  const monthlyPercent =
    monthlyPossible > 0 ? Math.round((currentMonthCompleted / monthlyPossible) * 100) : 0;

  return {
    todayCompleted,
    currentWeekCompleted: weeklyCompleted[currentWeekIndex] ?? 0,
    currentMonthCompleted,
    weeklyCompleted,
    weeklyPossible,
    weeklyPercent,
    monthlyPossible,
    monthlyPercent,
    weekCount,
    currentWeekIndex
  };
}
