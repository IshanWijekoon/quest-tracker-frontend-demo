import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeGoalProgress,
  createGoal,
  deleteOrDropGoal,
  setupDecadeWizard
} from "./goals";
import { createEmptyPlannerData } from "./planner-store";
import { addTask, markDone } from "./tasks";
import { prefillWeeklyReview } from "./reviews";
import type { PlannerTask } from "./types";

describe("goal hierarchy and rollup", () => {
  it("increases month progress when a linked task is completed, rolling up", () => {
    const now = new Date(2024, 2, 10);
    let data = createEmptyPlannerData(null);
    data = setupDecadeWizard(
      data,
      {
        decadeTitle: "Build a life of mastery",
        why: "Because growth compounds",
        metric: { name: "Net worth skill", targetValue: 100, unit: "pts", currentValue: 10 },
        decadeStart: "2024-01-01",
        decadeEnd: "2033-12-31",
        years: Array.from({ length: 10 }, (_, i) => {
          const base = { index: i + 1, title: `Year ${i + 1}` };
          if (i < 2) {
            return {
              ...base,
              why: "Focus",
              metric: { name: "Progress", targetValue: 10, unit: "pts", currentValue: 0 }
            };
          }
          return { ...base, metric: null as null };
        })
      },
      now
    );

    const year1 = data.goals.find((g) => g.level === "year" && g.sortOrder === 0)!;
    data = createGoal(data, { level: "quarter", parentId: year1.id, title: "Q1", status: "active" }, now);
    const q1 = data.goals.find((g) => g.level === "quarter")!;
    data = createGoal(data, { level: "month", parentId: q1.id, title: "March focus", status: "active" }, now);
    const month = data.goals.find((g) => g.level === "month")!;

    data = addTask(data, { title: "Ship feature", date: "2024-03-10", goalId: month.id }, now);
    data = addTask(data, { title: "Write docs", date: "2024-03-10", goalId: month.id }, now);

    let monthProgress = computeGoalProgress(data, month.id);
    assert.equal(monthProgress.percent, 0);

    data = markDone(data, data.tasks[0]!.id, now);
    monthProgress = computeGoalProgress(data, month.id);
    assert.equal(monthProgress.percent, 50);

    data = markDone(data, data.tasks[1]!.id, now);
    monthProgress = computeGoalProgress(data, month.id);
    assert.equal(monthProgress.percent, 100);

    const qProgress = computeGoalProgress(data, q1.id);
    assert.equal(qProgress.percent, 100);
    assert.equal(qProgress.mode, "children");

    const yearProgress = computeGoalProgress(data, year1.id);
    assert.equal(yearProgress.mode, "children");
    assert.equal(yearProgress.percent, 100);

    const decade = data.goals.find((g) => g.level === "decade")!;
    const decadeProgress = computeGoalProgress(data, decade.id);
    assert.equal(decadeProgress.mode, "children");
    // Year 1 is 100%; other years have no children → 0% → average across 10 years
    assert.equal(decadeProgress.percent, 10);
  });

  it("delete with drop_children detaches tasks and keeps records", () => {
    const now = new Date(2024, 2, 10);
    let data = createEmptyPlannerData(null);
    data = createGoal(data, {
      level: "decade",
      parentId: null,
      title: "Decade",
      status: "active"
    }, now);
    const decade = data.goals[0]!;
    data = createGoal(data, { level: "year", parentId: decade.id, title: "Y1" }, now);
    const year = data.goals.find((g) => g.level === "year")!;
    data = createGoal(data, { level: "quarter", parentId: year.id, title: "Q1" }, now);
    const quarter = data.goals.find((g) => g.level === "quarter")!;
    data = createGoal(data, { level: "month", parentId: quarter.id, title: "M1" }, now);
    const month = data.goals.find((g) => g.level === "month")!;
    data = addTask(data, { title: "Linked", date: "2024-03-10", goalId: month.id }, now);

    const taskId = data.tasks[0]!.id;
    data = deleteOrDropGoal(data, decade.id, { action: "drop_children" }, now);

    assert.ok(data.goals.every((g) => g.status === "dropped"));
    const task = data.tasks.find((t) => t.id === taskId) as PlannerTask;
    assert.ok(task);
    assert.equal(task.goalId, null);
    assert.equal(task.title, "Linked");
  });
});

describe("weekly review prefill", () => {
  it("prefills days completed and skip reasons excluding legacy", () => {
    const now = new Date(2024, 2, 13); // Wednesday → week Sun Mar 10 .. Sat Mar 16
    let data = createEmptyPlannerData(null);
    data = {
      ...data,
      tasks: [
        {
          id: "a",
          date: "2024-03-10",
          title: "A",
          goalId: null,
          plannedMinutes: null,
          minimumVersion: "",
          status: "done",
          completedAt: "2024-03-10T12:00:00",
          note: "",
          skipReason: null,
          templateId: null,
          sortOrder: 0,
          movedToDate: null,
          legacy: null,
          createdAt: "x"
        },
        {
          id: "b",
          date: "2024-03-11",
          title: "B",
          goalId: null,
          plannedMinutes: null,
          minimumVersion: "",
          status: "skipped",
          completedAt: null,
          note: "",
          skipReason: "tired",
          templateId: null,
          sortOrder: 0,
          movedToDate: null,
          legacy: null,
          createdAt: "x"
        },
        {
          id: "c",
          date: "2024-03-12",
          title: "C",
          goalId: null,
          plannedMinutes: null,
          minimumVersion: "",
          status: "skipped",
          completedAt: null,
          note: "",
          skipReason: "other",
          templateId: null,
          sortOrder: 0,
          movedToDate: null,
          legacy: { habitId: "h", monthKey: "2024-03", cell: "blank" },
          createdAt: "x"
        }
      ]
    };

    const prefill = prefillWeeklyReview(data, now);
    assert.ok(prefill.daysCompleted.includes("2024-03-10"));
    assert.ok(prefill.skipReasons.some((r) => r.reason === "tired" && r.count === 1));
    assert.ok(!prefill.skipReasons.some((r) => r.reason === "other"));
  });
});
