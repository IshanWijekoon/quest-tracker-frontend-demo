import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyPlannerData } from "./planner-store";
import {
  addTask,
  daySucceeded,
  generateTasksFromTemplates,
  markMinimumDone,
  moveTask,
  setRestDay
} from "./tasks";
import { computeStreakStats } from "./streaks";
import type { PlannerTask, TaskTemplate } from "./types";

function task(partial: Partial<PlannerTask> & Pick<PlannerTask, "id" | "date" | "title" | "status">): PlannerTask {
  return {
    goalId: null,
    plannedMinutes: null,
    minimumVersion: "15 min",
    completedAt: null,
    note: "",
    skipReason: null,
    templateId: null,
    sortOrder: 0,
    movedToDate: null,
    legacy: null,
    createdAt: "2024-03-10T12:00:00.000Z",
    ...partial
  };
}

describe("task states and streaks", () => {
  it("minimum_done keeps the streak", () => {
    const now = new Date(2024, 2, 12);
    let data = createEmptyPlannerData(null);
    data = {
      ...data,
      tasks: [
        task({ id: "t1", date: "2024-03-11", title: "A", status: "minimum_done" }),
        task({ id: "t2", date: "2024-03-11", title: "B", status: "done" })
      ]
    };

    assert.equal(daySucceeded(data, "2024-03-11"), true);
    const streaks = computeStreakStats(data, now);
    assert.equal(streaks.current, 1);
  });

  it("rest day does not break the streak", () => {
    const now = new Date(2024, 2, 13);
    let data = createEmptyPlannerData(null);
    data = {
      ...data,
      tasks: [
        task({ id: "t1", date: "2024-03-11", title: "A", status: "done" }),
        task({ id: "t2", date: "2024-03-12", title: "A", status: "todo" })
      ]
    };
    data = setRestDay(data, "2024-03-12", true);

    assert.equal(daySucceeded(data, "2024-03-12"), null);
    const streaks = computeStreakStats(data, now);
    assert.equal(streaks.current, 1);
  });

  it("can add tasks for tomorrow and a past date", () => {
    const now = new Date(2024, 2, 10);
    let data = createEmptyPlannerData(null);
    data = addTask(data, { title: "Future", date: "2024-03-11" }, now);
    data = addTask(data, { title: "Past", date: "2024-03-01" }, now);

    assert.ok(data.tasks.some((t) => t.date === "2024-03-11" && t.title === "Future"));
    assert.ok(data.tasks.some((t) => t.date === "2024-03-01" && t.title === "Past"));
  });

  it("move creates a todo on the target date and marks source moved", () => {
    const now = new Date(2024, 2, 10);
    let data = createEmptyPlannerData(null);
    data = addTask(data, { title: "Carry", date: "2024-03-09" }, now);
    const id = data.tasks[0]!.id;
    data = moveTask(data, id, "2024-03-10", now);

    const source = data.tasks.find((t) => t.id === id);
    assert.equal(source?.status, "moved");
    assert.equal(source?.movedToDate, "2024-03-10");
    assert.ok(data.tasks.some((t) => t.date === "2024-03-10" && t.title === "Carry" && t.status === "todo"));
  });

  it("markMinimumDone sets status", () => {
    const now = new Date(2024, 2, 10);
    let data = createEmptyPlannerData(null);
    data = addTask(data, { title: "Min", date: "2024-03-10", minimumVersion: "5 pushups" }, now);
    data = markMinimumDone(data, data.tasks[0]!.id, now);
    assert.equal(data.tasks[0]!.status, "minimum_done");
  });
});

describe("daily template generation", () => {
  it("does not duplicate on repeated generate", () => {
    const now = new Date(2024, 2, 10);
    const template: TaskTemplate = {
      id: "tmpl-1",
      title: "Daily",
      goalId: null,
      plannedMinutes: null,
      minimumVersion: "",
      recurrence: { kind: "daily" },
      startDate: "2024-03-01",
      endDate: null,
      active: true,
      color: "#fff",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    let data = { ...createEmptyPlannerData(null), templates: [template] };
    data = generateTasksFromTemplates(data, { now, horizonDays: 7 });
    const firstCount = data.tasks.length;
    data = generateTasksFromTemplates(data, { now, horizonDays: 7 });
    assert.equal(data.tasks.length, firstCount);
    assert.equal(firstCount, 8); // today + 7
  });
});
