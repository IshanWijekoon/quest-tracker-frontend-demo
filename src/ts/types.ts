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