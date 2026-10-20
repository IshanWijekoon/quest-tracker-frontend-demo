import { createId } from "./planner-store";
import { isRestDay } from "./tasks";
import type {
  Goal,
  GoalLevel,
  GoalStatus,
  PlannerData,
  PlannerTask,
  SuccessMetric
} from "./types";

export type ProgressBreakdown = {
  percent: number;
  mode: "metric" | "completion" | "children" | "empty";
  detail: string;
};

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function createGoal(
  data: PlannerData,
  input: {
    level: GoalLevel;
    parentId: string | null;
    title: string;
    description?: string;
    why?: string;
    successMetric?: SuccessMetric | null;
    startDate?: string | null;
    endDate?: string | null;
    status?: GoalStatus;
    sortOrder?: number;
  },
  now = new Date()
): PlannerData {
  const title = input.title.trim();
  if (!title) {
    return data;
  }

  if (input.parentId) {
    const parent = data.goals.find((g) => g.id === input.parentId);
    if (!parent) {
      return data;
    }
    if (!isValidParentChild(parent.level, input.level)) {
      return data;
    }
  } else if (input.level !== "decade") {
    return data;
  }

  const stamp = nowIso(now);
  const goal: Goal = {
    id: createId("goal"),
    level: input.level,
    parentId: input.parentId,
    title,
    description: (input.description ?? "").trim(),
    why: (input.why ?? "").trim(),
    successMetric: input.successMetric ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    status: input.status ?? "planned",
    sortOrder: input.sortOrder ?? data.goals.filter((g) => g.parentId === input.parentId).length,
    createdAt: stamp,
    updatedAt: stamp
  };

  return { ...data, goals: [...data.goals, goal] };
}

export function isValidParentChild(parentLevel: GoalLevel, childLevel: GoalLevel): boolean {
  return (
    (parentLevel === "decade" && childLevel === "year") ||
    (parentLevel === "year" && childLevel === "quarter") ||
    (parentLevel === "quarter" && childLevel === "month")
  );
}

export function updateGoal(
  data: PlannerData,
  goalId: string,
  patch: Partial<
    Pick<
      Goal,
      | "title"
      | "description"
      | "why"
      | "successMetric"
      | "startDate"
      | "endDate"
      | "status"
      | "sortOrder"
      | "parentId"
    >
  >,
  now = new Date()
): PlannerData {
  return {
    ...data,
    goals: data.goals.map((goal) => {
      if (goal.id !== goalId) {
        return goal;
      }
      const next = { ...goal, ...patch, updatedAt: nowIso(now) };
      if (patch.title !== undefined) {
        const trimmed = patch.title.trim();
        if (trimmed) {
          next.title = trimmed;
        }
      }
      return next;
    })
  };
}

export type GoalDeleteAction = "reassign" | "detach" | "drop_children";

export type GoalDeleteOptions = {
  action: GoalDeleteAction;
  reassignParentId?: string | null;
  reassignGoalIdForTasks?: string | null;
};

/**
 * Never cascade-deletes without an explicit action.
 * - reassign: move children to another parent; tasks to another month goal or detach
 * - detach: children become orphaned at same level only if decade; otherwise detach tasks and drop children links by setting parent null is invalid — instead mark children dropped and detach tasks
 * - drop_children: mark goal + descendants as dropped, detach tasks from those goals
 */
export function deleteOrDropGoal(
  data: PlannerData,
  goalId: string,
  options: GoalDeleteOptions,
  now = new Date()
): PlannerData {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal) {
    return data;
  }

  const descendants = collectDescendants(data.goals, goalId);
  const affectedIds = new Set([goalId, ...descendants.map((g) => g.id)]);

  if (options.action === "reassign") {
    const newParent = options.reassignParentId ?? null;
    if (newParent) {
      const parent = data.goals.find((g) => g.id === newParent);
      if (!parent || !isValidParentChild(parent.level, goal.level)) {
        return data;
      }
    } else if (goal.level !== "decade") {
      return data;
    }

    let next = updateGoal(data, goalId, { parentId: newParent }, now);

    const taskTarget = options.reassignGoalIdForTasks;
    if (taskTarget !== undefined) {
      next = {
        ...next,
        tasks: next.tasks.map((task) =>
          task.goalId && affectedIds.has(task.goalId)
            ? { ...task, goalId: taskTarget }
            : task
        )
      };
    }

    // Remove only the goal node; keep children under their existing parents unless this was the only link
    next = {
      ...next,
      goals: next.goals.filter((g) => g.id !== goalId)
    };
    return next;
  }

  if (options.action === "detach") {
    const parentOfGoal = goal.parentId
      ? data.goals.find((p) => p.id === goal.parentId)
      : undefined;

    const goals = data.goals
      .filter((g) => g.id !== goalId)
      .map((g) => {
        if (g.parentId !== goalId) {
          return g;
        }
        if (parentOfGoal && isValidParentChild(parentOfGoal.level, g.level)) {
          return { ...g, parentId: parentOfGoal.id, updatedAt: nowIso(now) };
        }
        return { ...g, status: "dropped" as const, updatedAt: nowIso(now) };
      });

    const tasks = data.tasks.map((task) =>
      task.goalId === goalId ? { ...task, goalId: null } : task
    );

    return { ...data, goals, tasks };
  }

  // drop_children: mark goal + descendants dropped, detach tasks
  const goals = data.goals.map((g) =>
    affectedIds.has(g.id)
      ? { ...g, status: "dropped" as const, updatedAt: nowIso(now) }
      : g
  );
  const tasks = data.tasks.map((task) =>
    task.goalId && affectedIds.has(task.goalId) ? { ...task, goalId: null } : task
  );

  return { ...data, goals, tasks };
}

export function collectDescendants(goals: Goal[], goalId: string): Goal[] {
  const result: Goal[] = [];
  const queue = [goalId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    for (const child of goals) {
      if (child.parentId === current) {
        result.push(child);
        queue.push(child.id);
      }
    }
  }
  return result;
}

export function getChildren(goals: Goal[], parentId: string | null): Goal[] {
  return goals
    .filter((g) => g.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export function getDecadeGoal(data: PlannerData): Goal | undefined {
  return data.goals.find((g) => g.level === "decade" && g.status !== "dropped");
}

export function getMonthGoals(data: PlannerData): Goal[] {
  return data.goals.filter((g) => g.level === "month" && g.status !== "dropped");
}

export function monthCompletionProgress(data: PlannerData, monthGoalId: string): ProgressBreakdown {
  const goal = data.goals.find((g) => g.id === monthGoalId);
  if (!goal) {
    return { percent: 0, mode: "empty", detail: "Goal not found" };
  }

  if (goal.successMetric && goal.successMetric.targetValue > 0) {
    const pct = Math.max(
      0,
      Math.min(100, Math.round((goal.successMetric.currentValue / goal.successMetric.targetValue) * 100))
    );
    return {
      percent: pct,
      mode: "metric",
      detail: `${goal.successMetric.currentValue} / ${goal.successMetric.targetValue} ${goal.successMetric.unit}`
    };
  }

  const linked = data.tasks.filter((t) => t.goalId === monthGoalId && t.status !== "moved");
  const countable = linked.filter((t) => {
    if (isRestDay(data, t.date)) {
      return false;
    }
    return (
      t.status === "todo" ||
      t.status === "done" ||
      t.status === "minimum_done" ||
      t.status === "skipped"
    );
  });

  if (countable.length === 0) {
    return { percent: 0, mode: "empty", detail: "No linked tasks yet" };
  }

  const success = countable.filter(
    (t) => t.status === "done" || t.status === "minimum_done"
  ).length;
  const percent = Math.round((success / countable.length) * 100);
  return {
    percent,
    mode: "completion",
    detail: `${success} / ${countable.length} tasks (done + minimum count as success; skipped count against)`
  };
}

export function computeGoalProgress(data: PlannerData, goalId: string): ProgressBreakdown {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal || goal.status === "dropped") {
    return { percent: 0, mode: "empty", detail: "Dropped or missing" };
  }

  if (goal.level === "month") {
    return monthCompletionProgress(data, goalId);
  }

  const children = getChildren(data.goals, goalId).filter((c) => c.status !== "dropped");
  if (children.length > 0) {
    const childPercents = children.map((child) => computeGoalProgress(data, child.id).percent);
    const avg = Math.round(childPercents.reduce((sum, p) => sum + p, 0) / childPercents.length);
    const metricNote =
      goal.successMetric && goal.successMetric.targetValue > 0
        ? ` · Metric also tracked: ${goal.successMetric.currentValue}/${goal.successMetric.targetValue} ${goal.successMetric.unit}`
        : "";
    return {
      percent: avg,
      mode: "children",
      detail: `Average of ${children.length} child goals (excluding dropped)${metricNote}`
    };
  }

  if (goal.successMetric && goal.successMetric.targetValue > 0) {
    const pct = Math.max(
      0,
      Math.min(100, Math.round((goal.successMetric.currentValue / goal.successMetric.targetValue) * 100))
    );
    return {
      percent: pct,
      mode: "metric",
      detail: `Metric: ${goal.successMetric.currentValue} / ${goal.successMetric.targetValue} ${goal.successMetric.unit}`
    };
  }

  return { percent: 0, mode: "empty", detail: "No child goals" };
}

export function countQuarterGoals(data: PlannerData, quarterId: string): number {
  return getChildren(data.goals, quarterId).filter((g) => g.status !== "dropped").length;
}

export function warnIfTooManyQuarterGoals(data: PlannerData, quarterId: string): boolean {
  return countQuarterGoals(data, quarterId) >= 2;
}

export function getLinkedTasks(data: PlannerData, goalId: string): PlannerTask[] {
  return data.tasks
    .filter((t) => t.goalId === goalId && t.status !== "moved")
    .sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder);
}

export function suggestDailyActions(monthGoal: Goal): Array<{ title: string; recurrence: "weekdays" | "daily"; plannedMinutes: number }> {
  const base = monthGoal.title.trim() || "Month goal";
  return [
    { title: `Work on: ${base}`, recurrence: "weekdays", plannedMinutes: 120 },
    { title: `Review progress: ${base}`, recurrence: "daily", plannedMinutes: 15 }
  ];
}

/** Previous month review unlocks current month planning. */
export function isMonthPlanningUnlocked(
  data: PlannerData,
  monthStartDate: string
): boolean {
  // First month of a decade plan, or any month where previous calendar month has a monthly review
  const [y, m] = monthStartDate.split("-").map(Number);
  if (!y || !m) {
    return false;
  }

  let prevYear = y;
  let prevMonth = m - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const prevStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const hasPriorMonthGoals = data.goals.some(
    (g) => g.level === "month" && g.startDate && g.startDate < monthStartDate && g.status !== "dropped"
  );

  if (!hasPriorMonthGoals) {
    return true;
  }

  return data.reviews.some(
    (r) => r.type === "monthly" && r.periodStart.startsWith(`${prevYear}-${String(prevMonth).padStart(2, "0")}`)
  ) || data.reviews.some((r) => r.type === "monthly" && r.periodStart === prevStart);
}

export function setupDecadeWizard(
  data: PlannerData,
  input: {
    decadeTitle: string;
    why: string;
    metric: SuccessMetric;
    decadeStart: string;
    decadeEnd: string;
    years: Array<{
      index: number; // 1..10
      title: string;
      why?: string;
      metric?: SuccessMetric | null;
      startDate?: string | null;
      endDate?: string | null;
    }>;
  },
  now = new Date()
): PlannerData {
  // Remove existing non-dropped decade and descendants if re-running wizard
  const existingDecade = getDecadeGoal(data);
  let next = data;
  if (existingDecade) {
    next = deleteOrDropGoal(next, existingDecade.id, { action: "drop_children" }, now);
  }

  next = createGoal(
    next,
    {
      level: "decade",
      parentId: null,
      title: input.decadeTitle,
      why: input.why,
      successMetric: input.metric,
      startDate: input.decadeStart,
      endDate: input.decadeEnd,
      status: "active"
    },
    now
  );

  const decade = getDecadeGoal(next);
  if (!decade) {
    return next;
  }

  for (const year of input.years) {
    const requireDetails = year.index <= 2;
    next = createGoal(
      next,
      {
        level: "year",
        parentId: decade.id,
        title: year.title || `Year ${year.index}`,
        why: requireDetails ? (year.why ?? "") : (year.why ?? ""),
        successMetric: requireDetails ? (year.metric ?? null) : (year.metric ?? null),
        startDate: year.startDate ?? null,
        endDate: year.endDate ?? null,
        status: year.index === 1 ? "active" : "planned",
        sortOrder: year.index - 1
      },
      now
    );
  }

  return next;
}

export function createDefaultQuartersForYear(
  data: PlannerData,
  yearGoalId: string,
  now = new Date()
): PlannerData {
  const year = data.goals.find((g) => g.id === yearGoalId && g.level === "year");
  if (!year) {
    return data;
  }

  const existing = getChildren(data.goals, yearGoalId).filter((g) => g.level === "quarter");
  if (existing.length > 0) {
    return data;
  }

  let next = data;
  for (let q = 1; q <= 4; q += 1) {
    next = createGoal(
      next,
      {
        level: "quarter",
        parentId: yearGoalId,
        title: `Q${q}`,
        status: q === 1 && year.status === "active" ? "active" : "planned",
        sortOrder: q - 1
      },
      now
    );
  }

  return updateGoal(next, yearGoalId, { status: "active" }, now);
}

export function activateYearAndPromptQuarters(
  data: PlannerData,
  yearGoalId: string,
  now = new Date()
): PlannerData {
  return createDefaultQuartersForYear(data, yearGoalId, now);
}

/** Used by Today screen — decade why text. */
export function getDecadeWhy(data: PlannerData): string {
  return getDecadeGoal(data)?.why ?? "";
}

export function validateTaskGoalLink(data: PlannerData, goalId: string | null): boolean {
  if (goalId === null) {
    return true;
  }
  const goal = data.goals.find((g) => g.id === goalId);
  return Boolean(goal && goal.level === "month" && goal.status !== "dropped");
}
