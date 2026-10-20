import type {
  AppMode,
  DailyLog,
  PlannerData,
  PlannerMeta,
  PlannerSettings,
  ReminderSettings
} from "./types";

export const HABITS_STORAGE_KEY = "humanos_habits_v3";
export const HABITS_BACKUP_KEY = "humanos_habits_v3_backup";
export const PLANNER_STORAGE_KEY = "humanos_planner_v1";
export const PLANNER_META_KEY = "humanos_planner_meta_v1";

export function defaultReminders(): ReminderSettings {
  return {
    morningEnabled: true,
    morningTime: "08:00",
    eveningEnabled: true,
    eveningTime: "21:00",
    sundayReviewEnabled: true,
    sundayReviewTime: "18:00",
    monthEndEnabled: true,
    monthEndTime: "19:00"
  };
}

export function defaultSettings(): PlannerSettings {
  return {
    weekStartsOn: 0,
    reminders: defaultReminders()
  };
}

export function createEmptyPlannerData(migratedFromHash: string | null = null): PlannerData {
  return {
    version: 1,
    migratedFromHash,
    goals: [],
    tasks: [],
    templates: [],
    dailyLogs: [],
    reviews: [],
    settings: defaultSettings()
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

export function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function loadPlannerData(): PlannerData | null {
  const parsed = safeJsonParse<PlannerData>(localStorage.getItem(PLANNER_STORAGE_KEY));
  if (!parsed || parsed.version !== 1) {
    return null;
  }
  return normalizePlannerData(parsed);
}

export function savePlannerData(data: PlannerData): void {
  localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(data));
}

export function loadPlannerMeta(): PlannerMeta | null {
  return safeJsonParse<PlannerMeta>(localStorage.getItem(PLANNER_META_KEY));
}

export function savePlannerMeta(meta: PlannerMeta): void {
  localStorage.setItem(PLANNER_META_KEY, JSON.stringify(meta));
}

export function setAppMode(mode: AppMode): PlannerMeta {
  const existing = loadPlannerMeta();
  const meta: PlannerMeta = existing
    ? { ...existing, mode }
    : {
        mode,
        migratedFromHash: null,
        migratedAt: null,
        templateCount: 0,
        taskCount: 0
      };
  savePlannerMeta(meta);
  return meta;
}

export function getAppMode(): AppMode {
  const meta = loadPlannerMeta();
  return meta?.mode ?? "legacy";
}

export function backupHabitsDataIfNeeded(): void {
  const existingBackup = localStorage.getItem(HABITS_BACKUP_KEY);
  if (existingBackup) {
    return;
  }
  const source = localStorage.getItem(HABITS_STORAGE_KEY);
  if (source) {
    localStorage.setItem(HABITS_BACKUP_KEY, source);
  }
}

export function readHabitsRaw(): string | null {
  return localStorage.getItem(HABITS_STORAGE_KEY);
}

export function normalizePlannerData(data: PlannerData): PlannerData {
  return {
    version: 1,
    migratedFromHash: data.migratedFromHash ?? null,
    goals: Array.isArray(data.goals) ? data.goals : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    templates: Array.isArray(data.templates) ? data.templates : [],
    dailyLogs: Array.isArray(data.dailyLogs) ? data.dailyLogs : [],
    reviews: Array.isArray(data.reviews) ? data.reviews : [],
    settings: {
      weekStartsOn: data.settings?.weekStartsOn === 1 ? 1 : 0,
      reminders: {
        ...defaultReminders(),
        ...(data.settings?.reminders ?? {})
      }
    }
  };
}

export function getOrCreateDailyLog(data: PlannerData, date: string): { data: PlannerData; log: DailyLog } {
  const existing = data.dailyLogs.find((log) => log.date === date);
  if (existing) {
    return { data, log: existing };
  }

  const log: DailyLog = {
    date,
    energy: null,
    mood: null,
    oneLineSummary: "",
    isRestDay: false
  };

  return {
    data: { ...data, dailyLogs: [...data.dailyLogs, log] },
    log
  };
}

export function upsertDailyLog(data: PlannerData, log: DailyLog): PlannerData {
  const index = data.dailyLogs.findIndex((item) => item.date === log.date);
  if (index === -1) {
    return { ...data, dailyLogs: [...data.dailyLogs, log] };
  }
  const dailyLogs = [...data.dailyLogs];
  dailyLogs[index] = log;
  return { ...data, dailyLogs };
}

export function resetPlannerStore(): void {
  localStorage.removeItem(PLANNER_STORAGE_KEY);
  localStorage.removeItem(PLANNER_META_KEY);
}

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter.toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
}
