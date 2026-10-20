export type Task = {
  id: string;
  name: string;
  completed: boolean;
  createdAt?: string;
};

export type Habit = {
  id: string;
  name: string;
  color: string;
};

export type CellState = "check" | "cross";

export type SideQuest = {
  id: string;
  text: string;
};

export type ManMilestone = {
  id: string;
  text: string;
  done: boolean;
};

export type HabitLog = {
  [date: string]: {
    [habitId: string]: boolean | CellState;
  };
};

export type MonthData = {
  habits: Habit[];
  log: HabitLog;
};

export type HabitsData = {
  months: {
    [monthKey: string]: MonthData;
  };
  sideQuests: SideQuest[];
  manMilestones: ManMilestone[];
};

export type DeepWorkSession = {
  task: string;
  duration: number;
  completed: boolean;
};

export type Skill = {
  id: string;
  name: string;
  hours: number;
  projects: number;
};

export type QuestPriority = "high" | "med" | "low";

export type DeadlineQuest = {
  id: string;
  title: string;
  deadline: string;
  priority: QuestPriority;
  done: boolean;
  notes: string;
  createdAt: string;
};

/* ---------- Planner domain (Phase 2+) ---------- */

export type GoalLevel = "decade" | "year" | "quarter" | "month";

export type GoalStatus = "planned" | "active" | "done" | "dropped";

export type SuccessMetric = {
  name: string;
  targetValue: number;
  unit: string;
  currentValue: number;
};

export type Goal = {
  id: string;
  level: GoalLevel;
  parentId: string | null;
  title: string;
  description: string;
  why: string;
  successMetric: SuccessMetric | null;
  startDate: string | null;
  endDate: string | null;
  status: GoalStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PlannerTaskStatus = "todo" | "done" | "minimum_done" | "skipped" | "moved";

export type SkipReason = "tired" | "busy" | "sick" | "unmotivated" | "other";

export type LegacyCell = "check" | "cross" | "blank";

export type TaskLegacyMeta = {
  habitId: string;
  monthKey: string;
  cell: LegacyCell;
};

export type PlannerTask = {
  id: string;
  date: string;
  title: string;
  goalId: string | null;
  plannedMinutes: number | null;
  minimumVersion: string;
  status: PlannerTaskStatus;
  completedAt: string | null;
  note: string;
  skipReason: SkipReason | null;
  templateId: string | null;
  sortOrder: number;
  movedToDate: string | null;
  legacy: TaskLegacyMeta | null;
  createdAt: string;
};

export type RecurrenceDaily = { kind: "daily" };
export type RecurrenceWeekdays = { kind: "weekdays" };
export type RecurrenceCustomDays = { kind: "custom_days"; daysOfWeek: number[] };
export type RecurrenceEveryN = { kind: "every_n_days"; n: number };

export type Recurrence =
  | RecurrenceDaily
  | RecurrenceWeekdays
  | RecurrenceCustomDays
  | RecurrenceEveryN;

export type TaskTemplate = {
  id: string;
  title: string;
  goalId: string | null;
  plannedMinutes: number | null;
  minimumVersion: string;
  recurrence: Recurrence;
  startDate: string;
  endDate: string | null;
  active: boolean;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type DailyLog = {
  date: string;
  energy: number | null;
  mood: number | null;
  oneLineSummary: string;
  isRestDay: boolean;
};

export type ReviewType = "weekly" | "monthly" | "quarterly" | "annual";

export type Review = {
  id: string;
  type: ReviewType;
  periodStart: string;
  periodEnd: string;
  answers: Record<string, unknown>;
  createdAt: string;
};

export type ReminderSettings = {
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  sundayReviewEnabled: boolean;
  sundayReviewTime: string;
  monthEndEnabled: boolean;
  monthEndTime: string;
};

export type PlannerSettings = {
  weekStartsOn: 0 | 1;
  reminders: ReminderSettings;
};

export type PlannerData = {
  version: 1;
  migratedFromHash: string | null;
  goals: Goal[];
  tasks: PlannerTask[];
  templates: TaskTemplate[];
  dailyLogs: DailyLog[];
  reviews: Review[];
  settings: PlannerSettings;
};

export type AppMode = "planner" | "legacy";

export type PlannerMeta = {
  mode: AppMode;
  migratedFromHash: string | null;
  migratedAt: string | null;
  templateCount: number;
  taskCount: number;
};
