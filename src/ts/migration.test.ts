import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HabitsData } from "./types";
import {
  computeLegacyStreak,
  computePlannerHistoricalStreak,
  migrateHabitsToPlanner
} from "./migration";
import { generateTasksFromTemplates, isTemplateActiveOnDate } from "./tasks";
import { createEmptyPlannerData } from "./planner-store";
import type { TaskTemplate } from "./types";

function fixtureHabits(): HabitsData {
  return {
    months: {
      "2024-02": {
        habits: [
          { id: "h1", name: "Deep Work", color: "#f9d66d" },
          { id: "h2", name: "Exercise", color: "#6db6ff" }
        ],
        log: {
          "2024-02-01": { h1: "check", h2: "check" },
          "2024-02-02": { h1: "check", h2: "cross" },
          "2024-02-03": { h1: "check" }
          // Feb 3: h2 blank → skip; leap day 29 exists
        }
      },
      "2024-03": {
        habits: [
          { id: "h3", name: "deep work", color: "#8ee48e" }, // same name merge
          { id: "h4", name: "Read", color: "#f29ec2" }
        ],
        log: {
          "2024-03-01": { h3: "check", h4: "check" }
        }
      }
    },
    sideQuests: [{ id: "sq1", text: "ignored" }],
    manMilestones: [{ id: "mm1", text: "ignored", done: false }]
  };
}

describe("migrateHabitsToPlanner", () => {
  it("does not mutate the source habits object", () => {
    const source = fixtureHabits();
    const raw = JSON.stringify(source);
    const cloneBefore = JSON.parse(raw) as HabitsData;
    const now = new Date(2024, 2, 15); // Mar 15 2024

    migrateHabitsToPlanner(source, raw, now);

    assert.deepEqual(source, cloneBefore);
  });

  it("merges quests by case-insensitive name into one template", () => {
    const source = fixtureHabits();
    const raw = JSON.stringify(source);
    const now = new Date(2024, 2, 15);
    const data = migrateHabitsToPlanner(source, raw, now);

    const titles = data.templates.map((t) => t.title.toLowerCase()).sort();
    assert.deepEqual(titles, ["deep work", "exercise", "read"]);
  });

  it("converts checks to done, crosses and blanks to skipped for past days", () => {
    const source = fixtureHabits();
    const raw = JSON.stringify(source);
    const now = new Date(2024, 2, 15);
    const data = migrateHabitsToPlanner(source, raw, now);

    const feb1 = data.tasks.filter((t) => t.date === "2024-02-01");
    assert.equal(feb1.length, 2);
    assert.ok(feb1.every((t) => t.status === "done"));

    const feb2Exercise = data.tasks.find(
      (t) => t.date === "2024-02-02" && t.title.toLowerCase() === "exercise"
    );
    assert.ok(feb2Exercise);
    assert.equal(feb2Exercise!.status, "skipped");
    assert.equal(feb2Exercise!.legacy?.cell, "cross");

    const feb3Exercise = data.tasks.find(
      (t) => t.date === "2024-02-03" && t.title.toLowerCase() === "exercise"
    );
    assert.ok(feb3Exercise);
    assert.equal(feb3Exercise!.status, "skipped");
    assert.equal(feb3Exercise!.legacy?.cell, "blank");
  });

  it("includes leap day February 29 2024", () => {
    const source = fixtureHabits();
    const raw = JSON.stringify(source);
    const now = new Date(2024, 2, 15);
    const data = migrateHabitsToPlanner(source, raw, now);

    const leap = data.tasks.filter((t) => t.date === "2024-02-29");
    assert.equal(leap.length, 2);
    assert.ok(leap.every((t) => t.status === "skipped"));
  });

  it("preserves streak parity under all-checked rule", () => {
    const source = fixtureHabits();
    const raw = JSON.stringify(source);
    const now = new Date(2024, 2, 15);
    const data = migrateHabitsToPlanner(source, raw, now);

    const legacy = computeLegacyStreak(source, now);
    const planner = computePlannerHistoricalStreak(data, now);

    assert.deepEqual(planner.successfulDays, legacy.successfulDays);
    assert.equal(planner.current, legacy.current);
    assert.equal(planner.longest, legacy.longest);
    // Feb 1 and Mar 1 are full successes
    assert.ok(legacy.successfulDays.includes("2024-02-01"));
    assert.ok(legacy.successfulDays.includes("2024-03-01"));
    assert.ok(!legacy.successfulDays.includes("2024-02-02"));
  });

  it("tags legacy metadata and leaves goalId null", () => {
    const source = fixtureHabits();
    const data = migrateHabitsToPlanner(source, JSON.stringify(source), new Date(2024, 2, 15));
    assert.ok(data.tasks.every((t) => t.goalId === null));
    assert.ok(data.tasks.every((t) => t.legacy !== null));
  });
});

describe("generateTasksFromTemplates", () => {
  it("creates weekday tasks only Mon-Fri and never duplicates", () => {
    const now = new Date(2024, 2, 11); // Monday Mar 11 2024
    let data = createEmptyPlannerData(null);
    const template: TaskTemplate = {
      id: "tmpl-wd",
      title: "Weekday focus",
      goalId: null,
      plannedMinutes: 60,
      minimumVersion: "15 min",
      recurrence: { kind: "weekdays" },
      startDate: "2024-03-01",
      endDate: null,
      active: true,
      color: "#6db6ff",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    data = { ...data, templates: [template] };

    data = generateTasksFromTemplates(data, { now, horizonDays: 7 });
    const dates = data.tasks.map((t) => t.date).sort();
    // today..today+7 = Mon 11 .. Mon 18; weekdays only → 11-15 and 18
    assert.deepEqual(dates, [
      "2024-03-11",
      "2024-03-12",
      "2024-03-13",
      "2024-03-14",
      "2024-03-15",
      "2024-03-18"
    ]);

    const again = generateTasksFromTemplates(data, { now, horizonDays: 7 });
    assert.equal(again.tasks.length, data.tasks.length);

    assert.equal(isTemplateActiveOnDate(template, "2024-03-16"), false); // Sat
    assert.equal(isTemplateActiveOnDate(template, "2024-03-11"), true);
  });
});
