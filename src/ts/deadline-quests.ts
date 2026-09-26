import { DeadlineQuest, QuestPriority } from "./types";

const STORAGE_KEY = "humanos_deadline_quests_v1";

const PRIORITY_RANK: Record<QuestPriority, number> = {
  high: 0,
  med: 1,
  low: 2
};

function createId(): string {
  return `deadline-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidPriority(value: unknown): value is QuestPriority {
  return value === "high" || value === "med" || value === "low";
}

function normalizeQuest(raw: Partial<DeadlineQuest>): DeadlineQuest | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.title !== "string") {
    return null;
  }

  if (typeof raw.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.deadline)) {
    return null;
  }

  if (!isValidPriority(raw.priority)) {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title.trim(),
    deadline: raw.deadline,
    priority: raw.priority,
    done: Boolean(raw.done),
    notes: typeof raw.notes === "string" ? raw.notes : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString()
  };
}

export function loadDeadlineQuests(): DeadlineQuest[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeQuest(item as Partial<DeadlineQuest>))
      .filter((item): item is DeadlineQuest => item !== null);
  } catch {
    return [];
  }
}

export function saveDeadlineQuests(quests: DeadlineQuest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quests));
}

export function addDeadlineQuest(
  quests: DeadlineQuest[],
  input: {
    title: string;
    deadline: string;
    priority: QuestPriority;
    notes?: string;
  }
): DeadlineQuest[] {
  const title = input.title.trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(input.deadline) || !isValidPriority(input.priority)) {
    return quests;
  }

  const next: DeadlineQuest = {
    id: createId(),
    title,
    deadline: input.deadline,
    priority: input.priority,
    done: false,
    notes: (input.notes ?? "").trim(),
    createdAt: new Date().toISOString()
  };

  return [...quests, next];
}

export function updateDeadlineQuest(
  quests: DeadlineQuest[],
  id: string,
  patch: Partial<Pick<DeadlineQuest, "title" | "deadline" | "priority" | "notes" | "done">>
): DeadlineQuest[] {
  return quests.map((quest) => {
    if (quest.id !== id) {
      return quest;
    }

    const title = patch.title !== undefined ? patch.title.trim() : quest.title;
    const deadline = patch.deadline !== undefined ? patch.deadline : quest.deadline;
    const priority = patch.priority !== undefined ? patch.priority : quest.priority;
    const notes = patch.notes !== undefined ? patch.notes.trim() : quest.notes;
    const done = patch.done !== undefined ? patch.done : quest.done;

    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !isValidPriority(priority)) {
      return quest;
    }

    return {
      ...quest,
      title,
      deadline,
      priority,
      notes,
      done
    };
  });
}

export function toggleDeadlineQuestDone(quests: DeadlineQuest[], id: string): DeadlineQuest[] {
  return quests.map((quest) => (quest.id === id ? { ...quest, done: !quest.done } : quest));
}

export function removeDeadlineQuest(quests: DeadlineQuest[], id: string): DeadlineQuest[] {
  return quests.filter((quest) => quest.id !== id);
}

export function isOverdue(quest: DeadlineQuest, today = todayKey()): boolean {
  return !quest.done && quest.deadline < today;
}

export function isDueToday(quest: DeadlineQuest, today = todayKey()): boolean {
  return !quest.done && quest.deadline === today;
}

export function sortDeadlineQuests(quests: DeadlineQuest[]): DeadlineQuest[] {
  return [...quests].sort((a, b) => {
    if (a.done !== b.done) {
      return a.done ? 1 : -1;
    }

    if (a.deadline !== b.deadline) {
      return a.deadline.localeCompare(b.deadline);
    }

    const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function formatDeadlineLabel(deadline: string): string {
  const [year, month, day] = deadline.split("-").map(Number);
  if (!year || !month || !day) {
    return deadline;
  }

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
