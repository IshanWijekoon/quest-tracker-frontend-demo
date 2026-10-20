import {
  addDays,
  dayOfWeek,
  eachDateInclusive,
  isAfter,
  isBefore,
  isSameOrBefore,
  isValidDateKey,
  localNoonTimestamp,
  todayKey
} from "./dates";
import { createId } from "./planner-store";
import type {
  DailyLog,
  PlannerData,
  PlannerTask,
  PlannerTaskStatus,
  Recurrence,
  SkipReason,
  TaskTemplate
} from "./types";

const SKIP_REASONS: SkipReason[] = ["tired", "busy", "sick", "unmotivated", "other"];

export function isSkipReason(value: string): value is SkipReason {
  return (SKIP_REASONS as string[]).includes(value);
}

export function getSkipReasons(): SkipReason[] {
  return [...SKIP_REASONS];
}

function nextSortOrder(tasks: PlannerTask[], date: string): number {
  let max = -1;
  for (const task of tasks) {
    if (task.date === date && task.sortOrder > max) {
      max = task.sortOrder;
    }
  }
  return max + 1;
}

export function recurrenceMatches(recurrence: Recurrence, date: string, startDate: string): boolean {
  switch (recurrence.kind) {
    case "daily":
      return true;
    case "weekdays": {
      const dow = dayOfWeek(date);
      return dow >= 1 && dow <= 5;
    }
    case "custom_days":
      return recurrence.daysOfWeek.includes(dayOfWeek(date));
    case "every_n_days": {
      const n = Math.max(1, recurrence.n);
      // Count days from startDate
      const start = new Date(
        Number(startDate.slice(0, 4)),
        Number(startDate.slice(5, 7)) - 1,
        Number(startDate.slice(8, 10))
      );
      const current = new Date(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8, 10))
      );
      const diff = Math.round((current.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      return diff >= 0 && diff % n === 0;
    }
    default:
      return false;
  }
}

export function isTemplateActiveOnDate(template: TaskTemplate, date: string): boolean {
  if (!template.active) {
    return false;
  }
  if (isBefore(date, template.startDate)) {
    return false;
  }
  if (template.endDate && isAfter(date, template.endDate)) {
    return false;
  }
  return recurrenceMatches(template.recurrence, date, template.startDate);
}

export function findTaskByTemplateAndDate(
  tasks: PlannerTask[],
  templateId: string,
  date: string
): PlannerTask | undefined {
  return tasks.find((t) => t.templateId === templateId && t.date === date && t.status !== "moved");
}

/** Generate todo tasks for today..today+horizonDays without duplicating. */
export function generateTasksFromTemplates(
  data: PlannerData,
  options?: { now?: Date; horizonDays?: number }
): PlannerData {
  const now = options?.now ?? new Date();
  const horizon = options?.horizonDays ?? 7;
  const start = todayKey(now);
  const end = addDays(start, horizon);
  const dates = eachDateInclusive(start, end);
  const createdAt = now.toISOString();
  const newTasks: PlannerTask[] = [];

  for (const template of data.templates) {
    for (const date of dates) {
      if (!isTemplateActiveOnDate(template, date)) {
        continue;
      }
      if (findTaskByTemplateAndDate([...data.tasks, ...newTasks], template.id, date)) {
        continue;
      }

      newTasks.push({
        id: createId("task"),
        date,
        title: template.title,
        goalId: template.goalId,
        plannedMinutes: template.plannedMinutes,
        minimumVersion: template.minimumVersion,
        status: "todo",
        completedAt: null,
        note: "",
        skipReason: null,
        templateId: template.id,
        sortOrder: nextSortOrder([...data.tasks, ...newTasks], date),
        movedToDate: null,
        legacy: null,
        createdAt
      });
    }
  }

  if (newTasks.length === 0) {
    return data;
  }

  return { ...data, tasks: [...data.tasks, ...newTasks] };
}

export function getTasksForDate(data: PlannerData, date: string): PlannerTask[] {
  return data.tasks
    .filter((t) => t.date === date && t.status !== "moved")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export function isRestDay(data: PlannerData, date: string): boolean {
  return data.dailyLogs.some((log) => log.date === date && log.isRestDay);
}

export function setRestDay(data: PlannerData, date: string, isRest: boolean): PlannerData {
  const existing = data.dailyLogs.find((log) => log.date === date);
  if (existing) {
    const dailyLogs = data.dailyLogs.map((log) =>
      log.date === date ? { ...log, isRestDay: isRest } : log
    );
    return { ...data, dailyLogs };
  }

  const log: DailyLog = {
    date,
    energy: null,
    mood: null,
    oneLineSummary: "",
    isRestDay: isRest
  };
  return { ...data, dailyLogs: [...data.dailyLogs, log] };
}

export type QuickAddInput = {
  title: string;
  date?: string;
  goalId?: string | null;
  plannedMinutes?: number | null;
  minimumVersion?: string;
};

export function addTask(data: PlannerData, input: QuickAddInput, now = new Date()): PlannerData {
  const title = input.title.trim();
  if (!title) {
    return data;
  }

  const date = input.date && isValidDateKey(input.date) ? input.date : todayKey(now);
  const task: PlannerTask = {
    id: createId("task"),
    date,
    title,
    goalId: input.goalId ?? null,
    plannedMinutes: input.plannedMinutes ?? null,
    minimumVersion: (input.minimumVersion ?? "").trim(),
    status: "todo",
    completedAt: null,
    note: "",
    skipReason: null,
    templateId: null,
    sortOrder: nextSortOrder(data.tasks, date),
    movedToDate: null,
    legacy: null,
    createdAt: now.toISOString()
  };

  return { ...data, tasks: [...data.tasks, task] };
}

export function updateTask(
  data: PlannerData,
  taskId: string,
  patch: Partial<
    Pick<
      PlannerTask,
      | "title"
      | "date"
      | "goalId"
      | "plannedMinutes"
      | "minimumVersion"
      | "note"
      | "sortOrder"
      | "status"
      | "skipReason"
      | "completedAt"
      | "movedToDate"
    >
  >
): PlannerData {
  return {
    ...data,
    tasks: data.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      const next: PlannerTask = { ...task };
      if (patch.title !== undefined) {
        const trimmed = patch.title.trim();
        if (trimmed) {
          next.title = trimmed;
        }
      }
      if (patch.date !== undefined && isValidDateKey(patch.date)) {
        next.date = patch.date;
      }
      if (patch.goalId !== undefined) {
        next.goalId = patch.goalId;
      }
      if (patch.plannedMinutes !== undefined) {
        next.plannedMinutes = patch.plannedMinutes;
      }
      if (patch.minimumVersion !== undefined) {
        next.minimumVersion = patch.minimumVersion;
      }
      if (patch.note !== undefined) {
        next.note = patch.note;
      }
      if (patch.sortOrder !== undefined) {
        next.sortOrder = patch.sortOrder;
      }
      if (patch.status !== undefined) {
        next.status = patch.status;
      }
      if (patch.skipReason !== undefined) {
        next.skipReason = patch.skipReason;
      }
      if (patch.completedAt !== undefined) {
        next.completedAt = patch.completedAt;
      }
      if (patch.movedToDate !== undefined) {
        next.movedToDate = patch.movedToDate;
      }
      return next;
    })
  };
}

export function deleteTask(data: PlannerData, taskId: string): PlannerData {
  return { ...data, tasks: data.tasks.filter((t) => t.id !== taskId) };
}

export function setTaskStatus(
  data: PlannerData,
  taskId: string,
  status: PlannerTaskStatus,
  options?: { skipReason?: SkipReason; now?: Date }
): PlannerData {
  const now = options?.now ?? new Date();
  return updateTask(data, taskId, {
    status,
    skipReason: status === "skipped" ? (options?.skipReason ?? "other") : null,
    completedAt:
      status === "done" || status === "minimum_done"
        ? now.toISOString().replace(/\.\d{3}Z$/, "").replace(/Z$/, "")
        : null,
    movedToDate: null
  });
}

export function markDone(data: PlannerData, taskId: string, now = new Date()): PlannerData {
  return setTaskStatus(data, taskId, "done", { now });
}

export function markMinimumDone(data: PlannerData, taskId: string, now = new Date()): PlannerData {
  return setTaskStatus(data, taskId, "minimum_done", { now });
}

export function markSkipped(
  data: PlannerData,
  taskId: string,
  reason: SkipReason,
  now = new Date()
): PlannerData {
  return setTaskStatus(data, taskId, "skipped", { skipReason: reason, now });
}

export function moveTask(
  data: PlannerData,
  taskId: string,
  toDate: string,
  now = new Date()
): PlannerData {
  if (!isValidDateKey(toDate)) {
    return data;
  }

  const source = data.tasks.find((t) => t.id === taskId);
  if (!source || source.status === "moved") {
    return data;
  }

  const marked = updateTask(data, taskId, {
    status: "moved",
    movedToDate: toDate,
    completedAt: null,
    skipReason: null
  });

  const clone: PlannerTask = {
    id: createId("task"),
    date: toDate,
    title: source.title,
    goalId: source.goalId,
    plannedMinutes: source.plannedMinutes,
    minimumVersion: source.minimumVersion,
    status: "todo",
    completedAt: null,
    note: source.note,
    skipReason: null,
    templateId: source.templateId,
    sortOrder: nextSortOrder(marked.tasks, toDate),
    movedToDate: null,
    legacy: null,
    createdAt: now.toISOString()
  };

  return { ...marked, tasks: [...marked.tasks, clone] };
}

export function reorderTasks(data: PlannerData, date: string, orderedIds: string[]): PlannerData {
  const idSet = new Set(orderedIds);
  return {
    ...data,
    tasks: data.tasks.map((task) => {
      if (task.date !== date || !idSet.has(task.id)) {
        return task;
      }
      const index = orderedIds.indexOf(task.id);
      return { ...task, sortOrder: index };
    })
  };
}

export function addTemplate(
  data: PlannerData,
  input: {
    title: string;
    goalId?: string | null;
    plannedMinutes?: number | null;
    minimumVersion?: string;
    recurrence?: Recurrence;
    startDate?: string;
    endDate?: string | null;
    active?: boolean;
    color?: string;
  },
  now = new Date()
): PlannerData {
  const title = input.title.trim();
  if (!title) {
    return data;
  }

  const template: TaskTemplate = {
    id: createId("tmpl"),
    title,
    goalId: input.goalId ?? null,
    plannedMinutes: input.plannedMinutes ?? null,
    minimumVersion: (input.minimumVersion ?? "").trim(),
    recurrence: input.recurrence ?? { kind: "daily" },
    startDate: input.startDate && isValidDateKey(input.startDate) ? input.startDate : todayKey(now),
    endDate: input.endDate && isValidDateKey(input.endDate) ? input.endDate : null,
    active: input.active ?? true,
    color: input.color ?? "#6db6ff",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  return { ...data, templates: [...data.templates, template] };
}

export function updateTemplate(
  data: PlannerData,
  templateId: string,
  patch: Partial<
    Pick<
      TaskTemplate,
      | "title"
      | "goalId"
      | "plannedMinutes"
      | "minimumVersion"
      | "recurrence"
      | "startDate"
      | "endDate"
      | "active"
      | "color"
    >
  >,
  now = new Date()
): PlannerData {
  const templates = data.templates.map((template) => {
    if (template.id !== templateId) {
      return template;
    }
    return {
      ...template,
      ...patch,
      title: patch.title !== undefined ? patch.title.trim() || template.title : template.title,
      updatedAt: now.toISOString()
    };
  });

  const updated = templates.find((t) => t.id === templateId);
  if (!updated) {
    return { ...data, templates };
  }

  // Editing a template affects only future, not-yet-completed tasks
  const today = todayKey(now);
  const tasks = data.tasks.map((task) => {
    if (task.templateId !== templateId) {
      return task;
    }
    if (task.status !== "todo") {
      return task;
    }
    if (isBefore(task.date, today)) {
      return task;
    }

    return {
      ...task,
      title: updated.title,
      goalId: updated.goalId,
      plannedMinutes: updated.plannedMinutes,
      minimumVersion: updated.minimumVersion
    };
  });

  return { ...data, templates, tasks };
}

export function deleteTemplate(data: PlannerData, templateId: string): PlannerData {
  return {
    ...data,
    templates: data.templates.filter((t) => t.id !== templateId)
  };
}

export function getBacklogTodoTasks(data: PlannerData, now = new Date()): PlannerTask[] {
  const today = todayKey(now);
  return data.tasks
    .filter((t) => t.status === "todo" && isBefore(t.date, today))
    .sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder);
}

/** Mark all backlog todos as skipped (fresh start). Keeps records. */
export function freshStartBacklog(
  data: PlannerData,
  reason: SkipReason = "other",
  now = new Date()
): PlannerData {
  const today = todayKey(now);
  return {
    ...data,
    tasks: data.tasks.map((task) => {
      if (task.status !== "todo" || !isBefore(task.date, today)) {
        return task;
      }
      return {
        ...task,
        status: "skipped" as const,
        skipReason: reason,
        completedAt: null,
        note: task.note || "Fresh start"
      };
    })
  };
}

export function moveBacklogToToday(data: PlannerData, now = new Date()): PlannerData {
  const backlog = getBacklogTodoTasks(data, now);
  let next = data;
  const today = todayKey(now);
  for (const task of backlog) {
    next = moveTask(next, task.id, today, now);
  }
  return next;
}

export function skipBacklog(
  data: PlannerData,
  reason: SkipReason,
  now = new Date()
): PlannerData {
  return freshStartBacklog(data, reason, now);
}

export function completionRateForDate(data: PlannerData, date: string): {
  completed: number;
  total: number;
  percent: number;
} {
  if (isRestDay(data, date)) {
    return { completed: 0, total: 0, percent: 100 };
  }

  const tasks = getTasksForDate(data, date);
  const countable = tasks.filter(
    (t) =>
      t.status === "todo" ||
      t.status === "done" ||
      t.status === "minimum_done" ||
      t.status === "skipped"
  );
  const completed = countable.filter(
    (t) => t.status === "done" || t.status === "minimum_done"
  ).length;
  const total = countable.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

export function isSuccessStatus(status: PlannerTaskStatus): boolean {
  return status === "done" || status === "minimum_done";
}

export function daySucceeded(data: PlannerData, date: string): boolean | null {
  if (isRestDay(data, date)) {
    return null; // invisible to streak
  }
  const tasks = getTasksForDate(data, date);
  if (tasks.length === 0) {
    return null;
  }
  const countable = tasks.filter((t) => t.status !== "moved");
  if (countable.length === 0) {
    return null;
  }
  return countable.every((t) => isSuccessStatus(t.status));
}

/** Ensure completedAt uses local noon when completing on a past date via date field. */
export function completeOnDate(
  data: PlannerData,
  taskId: string,
  status: "done" | "minimum_done"
): PlannerData {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) {
    return data;
  }
  return updateTask(data, taskId, {
    status,
    completedAt: localNoonTimestamp(task.date),
    skipReason: null,
    movedToDate: null
  });
}

export function templateRecurrenceLabel(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case "daily":
      return "Daily";
    case "weekdays":
      return "Weekdays";
    case "custom_days": {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return recurrence.daysOfWeek.map((d) => names[d] ?? d).join(", ");
    }
    case "every_n_days":
      return `Every ${recurrence.n} days`;
    default:
      return "Custom";
  }
}

export { isSameOrBefore };
