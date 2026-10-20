import {
  addDays,
  firstDayOfMonth,
  formatDateKey,
  formatDisplayDate,
  getDaysInMonth,
  isValidDateKey,
  todayKey
} from "./dates";
import {
  addDeadlineQuest,
  formatDeadlineLabel,
  isDueToday,
  isOverdue,
  loadDeadlineQuests,
  removeDeadlineQuest,
  saveDeadlineQuests,
  sortDeadlineQuests,
  toggleDeadlineQuestDone
} from "./deadline-quests";
import {
  activateYearAndPromptQuarters,
  computeGoalProgress,
  createGoal,
  deleteOrDropGoal,
  getChildren,
  getDecadeWhy,
  getLinkedTasks,
  getMonthGoals,
  isMonthPlanningUnlocked,
  setupDecadeWizard,
  suggestDailyActions,
  updateGoal,
  warnIfTooManyQuarterGoals
} from "./goals";
import { rollbackToLegacy, runMigration } from "./migration";
import {
  createEmptyPlannerData,
  getOrCreateDailyLog,
  loadPlannerData,
  savePlannerData,
  upsertDailyLog
} from "./planner-store";
import { dismissReminder, getActiveReminders, type ReminderBanner } from "./reminders";
import {
  canCompleteMonthlyReview,
  getReviews,
  prefillWeeklyReview,
  saveReview
} from "./reviews";
import {
  buildHeatmap,
  computeStreakStats,
  correlationEnergyCompletion,
  energyVsCompletion,
  skipReasonAnalytics
} from "./streaks";
import {
  addTask,
  addTemplate,
  deleteTask,
  deleteTemplate,
  freshStartBacklog,
  generateTasksFromTemplates,
  getBacklogTodoTasks,
  getSkipReasons,
  getTasksForDate,
  isRestDay,
  isSkipReason,
  markDone,
  markMinimumDone,
  markSkipped,
  moveBacklogToToday,
  moveTask,
  reorderTasks,
  setRestDay,
  skipBacklog,
  templateRecurrenceLabel,
  updateTask,
  updateTemplate
} from "./tasks";
import type {
  DeadlineQuest,
  Goal,
  GoalLevel,
  PlannerData,
  QuestPriority,
  Recurrence,
  ReviewType,
  SkipReason,
  SuccessMetric,
  TaskTemplate
} from "./types";

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing element #${id}`);
  }
  return node as T;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setHidden(node: HTMLElement | null, hidden: boolean): void {
  if (!node) {
    return;
  }
  node.hidden = hidden;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

type PlannerView =
  | "today"
  | "calendar"
  | "goals"
  | "templates"
  | "reviews"
  | "stats"
  | "deadlines"
  | "settings";

let data: PlannerData = createEmptyPlannerData();
let selectedDate = todayKey();
let calendarCursor = new Date();
let calendarSelectedDay: string | null = null;
let activeView: PlannerView = "today";
let selectedGoalId: string | null = null;
let expandedGoalIds = new Set<string>();
let editingTemplateId: string | null = null;
let deadlineQuests = loadDeadlineQuests();
let catchUpDismissed = false;
let eventsBound = false;

const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  tired: "Tired",
  busy: "Busy",
  sick: "Sick",
  unmotivated: "Unmotivated",
  other: "Other"
};

/* ------------------------------------------------------------------ */
/* Persist + render                                                    */
/* ------------------------------------------------------------------ */

function persist(next: PlannerData): void {
  data = next;
  savePlannerData(data);
  render();
}

function render(): void {
  renderNav();
  renderReminders();
  renderCatchUp();
  renderToday();
  renderCalendar();
  renderGoals();
  renderTemplates();
  renderReviews();
  renderStats();
  renderDeadlines();
  renderSettings();
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

function isPlannerView(value: string): value is PlannerView {
  return (
    value === "today" ||
    value === "calendar" ||
    value === "goals" ||
    value === "templates" ||
    value === "reviews" ||
    value === "stats" ||
    value === "deadlines" ||
    value === "settings"
  );
}

function switchView(view: PlannerView): void {
  activeView = view;
  document.querySelectorAll<HTMLElement>(".planner-view").forEach((section) => {
    const isActive = section.dataset.view === view;
    section.classList.toggle("is-active", isActive);
    section.hidden = !isActive;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.nav === view);
  });
  render();
}

function renderNav(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.nav === activeView);
  });
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

function openModal(html: string): void {
  const backdrop = el("plannerModal");
  const card = el("plannerModalCard");
  card.innerHTML = html;
  backdrop.classList.add("is-open");
  backdrop.setAttribute("aria-hidden", "false");
}

function closeModal(): void {
  const backdrop = el("plannerModal");
  const card = el("plannerModalCard");
  card.innerHTML = "";
  backdrop.classList.remove("is-open");
  backdrop.setAttribute("aria-hidden", "true");
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

function renderReminders(): void {
  const host = el("reminderBanners");
  const banners = getActiveReminders(data);
  if (banners.length === 0) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = banners
    .map(
      (banner) => `
      <div class="reminder-banner" data-reminder="${escapeHtml(banner.kind)}">
        <div>
          <strong>${escapeHtml(banner.title)}</strong>
          <p>${escapeHtml(banner.body)}</p>
        </div>
        <div class="reminder-banner-actions">
          ${
            banner.kind === "evening"
              ? `<button type="button" class="month-action-btn" data-reminder-cta="checkin">Check in</button>`
              : ""
          }
          ${
            banner.kind === "sunday"
              ? `<button type="button" class="month-action-btn" data-reminder-cta="weekly">Open review</button>`
              : ""
          }
          ${
            banner.kind === "month_end"
              ? `<button type="button" class="month-action-btn" data-reminder-cta="monthly">Open review</button>`
              : ""
          }
          <button type="button" class="month-action-btn" data-reminder-dismiss="${escapeHtml(banner.kind)}">Dismiss</button>
        </div>
      </div>`
    )
    .join("");
}

function handleReminderAction(banner: ReminderBanner, action: "dismiss" | "cta"): void {
  const today = todayKey();
  if (action === "dismiss") {
    dismissReminder(banner.kind, today);
    if (banner.kind === "evening") {
      openCheckInModal();
    }
    renderReminders();
    return;
  }

  dismissReminder(banner.kind, today);
  if (banner.kind === "evening") {
    openCheckInModal();
  } else if (banner.kind === "sunday") {
    switchView("reviews");
    startWeeklyReview();
  } else if (banner.kind === "month_end") {
    switchView("reviews");
    startMonthlyReview();
  } else {
    switchView("today");
  }
  renderReminders();
}

/* ------------------------------------------------------------------ */
/* Catch-up                                                            */
/* ------------------------------------------------------------------ */

function renderCatchUp(): void {
  const panel = el("catchUpPanel");
  const backlog = getBacklogTodoTasks(data);
  if (catchUpDismissed || backlog.length === 0) {
    setHidden(panel, true);
    panel.innerHTML = "";
    return;
  }

  setHidden(panel, false);
  panel.innerHTML = `
    <div class="catch-up-content">
      <div>
        <strong>Catch up</strong>
        <p>${backlog.length} unfinished task${backlog.length === 1 ? "" : "s"} from past days.</p>
      </div>
      <div class="catch-up-actions">
        <button type="button" class="month-action-btn" data-catchup="move">Move all to today</button>
        <button type="button" class="month-action-btn" data-catchup="skip">Skip all</button>
        <button type="button" class="month-action-btn" data-catchup="fresh">Fresh start</button>
        <button type="button" class="month-action-btn" data-catchup="details">Details</button>
      </div>
    </div>`;
}

function openCatchUpDetails(): void {
  const backlog = getBacklogTodoTasks(data);
  openModal(`
    <h3>Backlog details</h3>
    <ul class="modal-list">
      ${backlog
        .map(
          (task) =>
            `<li><span>${escapeHtml(task.date)}</span> — ${escapeHtml(task.title)}</li>`
        )
        .join("")}
    </ul>
    <div class="modal-actions">
      <button type="button" class="month-action-btn" data-modal-close>Close</button>
    </div>`);
}

function openSkipAllModal(): void {
  openModal(`
    <h3>Skip all backlog tasks</h3>
    <p>Choose a skip reason:</p>
    <div class="skip-reason-grid">
      ${getSkipReasons()
        .map(
          (reason) =>
            `<button type="button" class="month-action-btn" data-skip-all="${reason}">${SKIP_REASON_LABELS[reason]}</button>`
        )
        .join("")}
    </div>
    <div class="modal-actions">
      <button type="button" class="month-action-btn" data-modal-close>Cancel</button>
    </div>`);
}

/* ------------------------------------------------------------------ */
/* Evening check-in                                                    */
/* ------------------------------------------------------------------ */

function openCheckInModal(): void {
  const today = todayKey();
  const { log } = getOrCreateDailyLog(data, today);
  openModal(`
    <h3>Evening check-in</h3>
    <form id="checkInForm" class="check-in-form">
      <label>Energy (1–5)
        <input class="habit-input" type="number" name="energy" min="1" max="5" value="${log.energy ?? 3}" required>
      </label>
      <label>Mood (1–5)
        <input class="habit-input" type="number" name="mood" min="1" max="5" value="${log.mood ?? 3}" required>
      </label>
      <label>One-line summary
        <input class="habit-input" type="text" name="summary" maxlength="160" value="${escapeHtml(log.oneLineSummary)}" placeholder="How did today go?">
      </label>
      <label>Tomorrow task (optional)
        <input class="habit-input" type="text" name="tomorrow" maxlength="120" placeholder="Plan one task for tomorrow">
      </label>
      <div class="modal-actions">
        <button type="button" class="month-action-btn" data-modal-close>Cancel</button>
        <button type="submit" class="bg-blue-500 px-4 py-2">Save</button>
      </div>
    </form>`);
}

function submitCheckIn(form: HTMLFormElement): void {
  const today = todayKey();
  const fd = new FormData(form);
  const energyRaw = Number(fd.get("energy"));
  const moodRaw = Number(fd.get("mood"));
  const summary = String(fd.get("summary") ?? "").trim();
  const tomorrowTitle = String(fd.get("tomorrow") ?? "").trim();

  const energy = Number.isFinite(energyRaw) ? Math.min(5, Math.max(1, Math.round(energyRaw))) : 3;
  const mood = Number.isFinite(moodRaw) ? Math.min(5, Math.max(1, Math.round(moodRaw))) : 3;

  const existing = data.dailyLogs.find((l) => l.date === today);
  let next = upsertDailyLog(data, {
    date: today,
    energy,
    mood,
    oneLineSummary: summary,
    isRestDay: existing?.isRestDay ?? false
  });

  if (tomorrowTitle) {
    next = addTask(next, { title: tomorrowTitle, date: addDays(today, 1) });
  }

  closeModal();
  persist(next);
}

/* ------------------------------------------------------------------ */
/* Today                                                               */
/* ------------------------------------------------------------------ */

function fillMonthGoalSelect(select: HTMLSelectElement, selectedId: string | null = null): void {
  const months = getMonthGoals(data);
  const options = [
    `<option value="">No month goal (unlinked)</option>`,
    ...months.map(
      (g) =>
        `<option value="${escapeHtml(g.id)}"${selectedId === g.id ? " selected" : ""}>${escapeHtml(g.title)}</option>`
    )
  ];
  select.innerHTML = options.join("");
}

function renderToday(): void {
  const title = el("todayTitle");
  const why = el("decadeWhy");
  const picker = el<HTMLInputElement>("todayDatePicker");
  const restToggle = el<HTMLInputElement>("restDayToggle");
  const warning = el("neverMissWarning");
  const streakBar = el("streakBar");
  const quickDate = el<HTMLInputElement>("quickAddDate");
  const quickGoal = el<HTMLSelectElement>("quickAddGoal");
  const taskList = el("taskList");
  const quickForm = el<HTMLFormElement>("quickAddForm");

  const isToday = selectedDate === todayKey();
  title.textContent = isToday ? "Today" : formatDisplayDate(selectedDate);
  why.textContent = getDecadeWhy(data) || "Set a 10-year goal to see your why here.";

  picker.value = selectedDate;
  quickDate.value = selectedDate;
  fillMonthGoalSelect(quickGoal);

  const rest = isRestDay(data, selectedDate);
  restToggle.checked = rest;

  const streaks = computeStreakStats(data);
  warning.hidden = !streaks.neverMissTwice;
  streakBar.innerHTML = `
    <div class="streak-pill">Current streak: <strong>${streaks.current}</strong></div>
    <div class="streak-pill">Longest: <strong>${streaks.longest}</strong></div>
    ${streaks.yesterdayMissed ? `<div class="streak-pill warn">Yesterday missed</div>` : ""}`;

  setHidden(quickForm, rest);
  if (rest) {
    taskList.innerHTML = `<li class="task-rest-message">Rest day — tasks are paused. Uncheck Rest day to resume.</li>`;
    return;
  }

  const tasks = getTasksForDate(data, selectedDate);
  const hasGoals = getMonthGoals(data).length > 0;

  if (tasks.length === 0) {
    taskList.innerHTML = `<li class="task-empty">No tasks for this day. Add one above or generate from templates.</li>`;
    return;
  }

  taskList.innerHTML = tasks
    .map((task, index) => {
      const unlinked = task.goalId === null && hasGoals;
      const statusLabel = task.status.replace(/_/g, " ");
      return `
        <li class="task-item status-${escapeHtml(task.status)}" data-task-id="${escapeHtml(task.id)}">
          <div class="task-main">
            <span class="task-title">${escapeHtml(task.title)}</span>
            <span class="task-status">${escapeHtml(statusLabel)}</span>
            ${unlinked ? `<span class="task-badge">unlinked</span>` : ""}
            ${task.minimumVersion ? `<span class="task-min">min: ${escapeHtml(task.minimumVersion)}</span>` : ""}
            ${task.skipReason ? `<span class="task-skip">${escapeHtml(SKIP_REASON_LABELS[task.skipReason])}</span>` : ""}
          </div>
          <div class="task-actions">
            <button type="button" class="month-action-btn" data-task-action="done" ${task.status === "done" ? "disabled" : ""}>Done</button>
            ${
              task.minimumVersion
                ? `<button type="button" class="month-action-btn" data-task-action="minimum">Do minimum</button>`
                : ""
            }
            <button type="button" class="month-action-btn" data-task-action="skip">Skip</button>
            <button type="button" class="month-action-btn" data-task-action="move">Move</button>
            <button type="button" class="month-action-btn" data-task-action="edit">Edit</button>
            <button type="button" class="month-action-btn" data-task-action="delete">Delete</button>
            <button type="button" class="month-nav-btn" data-task-action="up" ${index === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
            <button type="button" class="month-nav-btn" data-task-action="down" ${index === tasks.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
          </div>
        </li>`;
    })
    .join("");
}

function openSkipReasonModal(taskId: string): void {
  openModal(`
    <h3>Skip reason</h3>
    <div class="skip-reason-grid">
      ${getSkipReasons()
        .map(
          (reason) =>
            `<button type="button" class="month-action-btn" data-skip-task="${escapeHtml(taskId)}" data-skip-reason="${reason}">${SKIP_REASON_LABELS[reason]}</button>`
        )
        .join("")}
    </div>
    <div class="modal-actions">
      <button type="button" class="month-action-btn" data-modal-close>Cancel</button>
    </div>`);
}

function handleTaskAction(taskId: string, action: string): void {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) {
    return;
  }

  if (action === "done") {
    persist(markDone(data, taskId));
    return;
  }
  if (action === "minimum") {
    persist(markMinimumDone(data, taskId));
    return;
  }
  if (action === "skip") {
    openSkipReasonModal(taskId);
    return;
  }
  if (action === "move") {
    const nextDate = window.prompt("Move to date (YYYY-MM-DD):", addDays(selectedDate, 1));
    if (!nextDate || !isValidDateKey(nextDate)) {
      return;
    }
    persist(moveTask(data, taskId, nextDate));
    return;
  }
  if (action === "edit") {
    const title = window.prompt("Edit title:", task.title);
    if (title === null) {
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    const min = window.prompt("Minimum version (optional):", task.minimumVersion);
    if (min === null) {
      return;
    }
    persist(
      updateTask(data, taskId, {
        title: trimmed,
        minimumVersion: min.trim()
      })
    );
    return;
  }
  if (action === "delete") {
    if (!window.confirm(`Delete "${task.title}"?`)) {
      return;
    }
    persist(deleteTask(data, taskId));
    return;
  }
  if (action === "up" || action === "down") {
    const tasks = getTasksForDate(data, selectedDate);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index < 0) {
      return;
    }
    const swapWith = action === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= tasks.length) {
      return;
    }
    const ids = tasks.map((t) => t.id);
    const tmp = ids[index]!;
    ids[index] = ids[swapWith]!;
    ids[swapWith] = tmp;
    persist(reorderTasks(data, selectedDate, ids));
  }
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

function renderCalendar(): void {
  const label = el("calMonthLabel");
  const grid = el("calendarGrid");
  const detail = el("calendarDayDetail");

  const year = calendarCursor.getFullYear();
  const monthIndex = calendarCursor.getMonth();
  label.textContent = calendarCursor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const weekStartsOn = data.settings.weekStartsOn;
  const dayNames =
    weekStartsOn === 1
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const firstDow = new Date(year, monthIndex, 1).getDay();
  const offset = weekStartsOn === 1 ? (firstDow + 6) % 7 : firstDow;
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const today = todayKey();

  let html = dayNames.map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < offset; i += 1) {
    html += `<div class="cal-cell is-empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateKey(year, monthIndex, day);
    const tasks = getTasksForDate(data, dateKey);
    const rest = isRestDay(data, dateKey);
    const done = tasks.filter((t) => t.status === "done" || t.status === "minimum_done").length;
    const classes = [
      "cal-cell",
      dateKey === today ? "is-today" : "",
      dateKey === calendarSelectedDay ? "is-selected" : "",
      rest ? "is-rest" : "",
      tasks.length > 0 ? "has-tasks" : ""
    ]
      .filter(Boolean)
      .join(" ");

    html += `
      <button type="button" class="${classes}" data-cal-day="${dateKey}">
        <span class="cal-day-num">${day}</span>
        ${rest ? `<span class="cal-meta">Rest</span>` : tasks.length ? `<span class="cal-meta">${done}/${tasks.length}</span>` : ""}
      </button>`;
  }

  grid.innerHTML = html;

  if (!calendarSelectedDay) {
    detail.innerHTML = `<p class="calendar-hint">Click a day to see tasks.</p>`;
    return;
  }

  const dayTasks = getTasksForDate(data, calendarSelectedDay);
  detail.innerHTML = `
    <div class="calendar-day-head">
      <h3>${escapeHtml(formatDisplayDate(calendarSelectedDay))}</h3>
      <button type="button" class="month-action-btn" data-cal-open-today="${escapeHtml(calendarSelectedDay)}">Open in Today</button>
    </div>
    ${
      dayTasks.length === 0
        ? `<p>No tasks.</p>`
        : `<ul>${dayTasks
            .map(
              (t) =>
                `<li>${escapeHtml(t.title)} <span class="task-status">${escapeHtml(t.status.replace(/_/g, " "))}</span></li>`
            )
            .join("")}</ul>`
    }`;
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

function childLevelFor(parent: GoalLevel): GoalLevel | null {
  if (parent === "decade") return "year";
  if (parent === "year") return "quarter";
  if (parent === "quarter") return "month";
  return null;
}

function renderGoalNode(goal: Goal, depth: number): string {
  const children = getChildren(data.goals, goal.id).filter((g) => g.status !== "dropped");
  const progress = computeGoalProgress(data, goal.id);
  const expanded = expandedGoalIds.has(goal.id) || depth === 0;
  const hasChildren = children.length > 0;
  const selected = selectedGoalId === goal.id;

  return `
    <div class="goal-node depth-${depth}${selected ? " is-selected" : ""}" data-goal-id="${escapeHtml(goal.id)}">
      <div class="goal-row">
        ${
          hasChildren
            ? `<button type="button" class="goal-expand" data-goal-toggle="${escapeHtml(goal.id)}" aria-label="Toggle">${expanded ? "▾" : "▸"}</button>`
            : `<span class="goal-expand-spacer"></span>`
        }
        <button type="button" class="goal-select" data-goal-select="${escapeHtml(goal.id)}">
          <span class="goal-level">${escapeHtml(goal.level)}</span>
          <span class="goal-title">${escapeHtml(goal.title)}</span>
          <span class="goal-status">${escapeHtml(goal.status)}</span>
          <span class="goal-progress">${progress.percent}%</span>
        </button>
      </div>
      ${expanded && hasChildren ? `<div class="goal-children">${children.map((c) => renderGoalNode(c, depth + 1)).join("")}</div>` : ""}
    </div>`;
}

function renderGoals(): void {
  const tree = el("goalsTree");
  const detail = el("goalDetail");
  const wizard = el("goalWizard");

  const monthStart = firstDayOfMonth(new Date().getFullYear(), new Date().getMonth());
  const unlocked = isMonthPlanningUnlocked(data, monthStart);

  const roots = getChildren(data.goals, null).filter((g) => g.status !== "dropped");
  if (roots.length === 0) {
    tree.innerHTML = `<p class="goals-empty">No goals yet. Start the 10-year setup.</p>`;
  } else {
    tree.innerHTML = roots.map((g) => renderGoalNode(g, 0)).join("");
  }

  if (!unlocked) {
    tree.insertAdjacentHTML(
      "afterbegin",
      `<div class="month-planning-locked">Month planning is locked until you finish last month's review.</div>`
    );
  }

  if (!selectedGoalId) {
    setHidden(detail, true);
    detail.innerHTML = "";
  } else {
    const goal = data.goals.find((g) => g.id === selectedGoalId);
    if (!goal || goal.status === "dropped") {
      selectedGoalId = null;
      setHidden(detail, true);
      detail.innerHTML = "";
    } else {
      setHidden(detail, false);
      renderGoalDetail(goal, detail, unlocked);
    }
  }

  // Keep wizard visibility as-is when actively filling; hide if empty
  if (!wizard.dataset.open) {
    setHidden(wizard, true);
  }
}

function renderGoalDetail(goal: Goal, host: HTMLElement, monthUnlocked: boolean): void {
  const progress = computeGoalProgress(data, goal.id);
  const linked = getLinkedTasks(data, goal.id);
  const childLevel = childLevelFor(goal.level);
  const canAddChild =
    childLevel !== null &&
    (childLevel !== "month" || monthUnlocked);

  host.innerHTML = `
    <div class="goal-detail-head">
      <h3>${escapeHtml(goal.title)}</h3>
      <p class="goal-detail-meta">${escapeHtml(goal.level)} · ${escapeHtml(goal.status)} · ${progress.percent}%</p>
      <p class="goal-detail-progress">${escapeHtml(progress.detail)}</p>
      ${goal.why ? `<p class="goal-why"><strong>Why:</strong> ${escapeHtml(goal.why)}</p>` : ""}
    </div>
    <div class="goal-detail-actions">
      <button type="button" class="month-action-btn" data-goal-edit="${escapeHtml(goal.id)}">Edit</button>
      ${
        canAddChild
          ? `<button type="button" class="month-action-btn" data-goal-add-child="${escapeHtml(goal.id)}">Add ${escapeHtml(childLevel!)}</button>`
          : childLevel === "month" && !monthUnlocked
            ? `<span class="goal-locked-hint">Add month goal locked until prior monthly review</span>`
            : ""
      }
      ${
        goal.level === "year"
          ? `<button type="button" class="month-action-btn" data-goal-activate-year="${escapeHtml(goal.id)}">Activate year</button>`
          : ""
      }
      <button type="button" class="month-action-btn danger-action-btn" data-goal-drop="${escapeHtml(goal.id)}">Drop goal</button>
    </div>
    <h4 class="planner-subheading">Linked tasks</h4>
    ${
      linked.length === 0
        ? `<p>No linked tasks.</p>`
        : `<ul>${linked
            .slice(0, 40)
            .map(
              (t) =>
                `<li>${escapeHtml(t.date)} — ${escapeHtml(t.title)} (${escapeHtml(t.status)})</li>`
            )
            .join("")}</ul>`
    }
    ${
      goal.level === "month"
        ? `<div class="goal-suggestions">
            <h4 class="planner-subheading">Suggested daily actions</h4>
            <ul>${suggestDailyActions(goal)
              .map((s) => `<li>${escapeHtml(s.title)} (${escapeHtml(s.recurrence)}, ${s.plannedMinutes}m)</li>`)
              .join("")}</ul>
            <button type="button" class="month-action-btn" data-goal-apply-suggestions="${escapeHtml(goal.id)}">Add as templates</button>
          </div>`
        : ""
    }`;
}

function openDecadeWizard(): void {
  const wizard = el("goalWizard");
  wizard.dataset.open = "1";
  setHidden(wizard, false);

  const yearRows = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const requireDetails = n <= 2;
    return `
      <fieldset class="wizard-year">
        <legend>Year ${n}${requireDetails ? " (details required)" : ""}</legend>
        <input class="habit-input" name="yearTitle${n}" type="text" placeholder="Year ${n} title" required maxlength="120">
        ${
          requireDetails
            ? `
          <input class="habit-input" name="yearWhy${n}" type="text" placeholder="Why" required maxlength="200">
          <input class="habit-input" name="yearMetricName${n}" type="text" placeholder="Metric name" required>
          <input class="habit-input" name="yearMetricTarget${n}" type="number" min="1" placeholder="Target" required>
          <input class="habit-input" name="yearMetricUnit${n}" type="text" placeholder="Unit" required>
        `
            : ""
        }
      </fieldset>`;
  }).join("");

  const now = new Date();
  const startYear = now.getFullYear();
  wizard.innerHTML = `
    <h3>10-year setup</h3>
    <form id="decadeWizardForm" class="decade-wizard-form">
      <label>Decade title <input class="habit-input" name="decadeTitle" required maxlength="120"></label>
      <label>Why <input class="habit-input" name="why" required maxlength="240"></label>
      <label>Metric name <input class="habit-input" name="metricName" required></label>
      <label>Target <input class="habit-input" name="metricTarget" type="number" min="1" required></label>
      <label>Unit <input class="habit-input" name="metricUnit" required></label>
      <label>Start year <input class="habit-input" name="startYear" type="number" value="${startYear}" required></label>
      ${yearRows}
      <div class="modal-actions">
        <button type="button" class="month-action-btn" id="cancelWizardBtn">Cancel</button>
        <button type="submit" class="bg-blue-500 px-4 py-2">Create plan</button>
      </div>
    </form>`;
}

function submitDecadeWizard(form: HTMLFormElement): void {
  const fd = new FormData(form);
  const decadeTitle = String(fd.get("decadeTitle") ?? "").trim();
  const why = String(fd.get("why") ?? "").trim();
  const metricName = String(fd.get("metricName") ?? "").trim();
  const metricTarget = Number(fd.get("metricTarget"));
  const metricUnit = String(fd.get("metricUnit") ?? "").trim();
  const startYear = Number(fd.get("startYear"));

  if (!decadeTitle || !why || !metricName || !metricUnit || !Number.isFinite(metricTarget) || metricTarget <= 0) {
    return;
  }
  if (!Number.isFinite(startYear)) {
    return;
  }

  const metric: SuccessMetric = {
    name: metricName,
    targetValue: metricTarget,
    unit: metricUnit,
    currentValue: 0
  };

  const years: Array<{
    index: number;
    title: string;
    why?: string;
    metric?: SuccessMetric | null;
    startDate?: string | null;
    endDate?: string | null;
  }> = [];

  for (let n = 1; n <= 10; n += 1) {
    const title = String(fd.get(`yearTitle${n}`) ?? "").trim() || `Year ${n}`;
    const yStart = `${startYear + n - 1}-01-01`;
    const yEnd = `${startYear + n - 1}-12-31`;
    if (n <= 2) {
      const yearWhy = String(fd.get(`yearWhy${n}`) ?? "").trim();
      const yMetricName = String(fd.get(`yearMetricName${n}`) ?? "").trim();
      const yMetricTarget = Number(fd.get(`yearMetricTarget${n}`));
      const yMetricUnit = String(fd.get(`yearMetricUnit${n}`) ?? "").trim();
      const yearMetric: SuccessMetric = {
        name: yMetricName || `Year ${n} metric`,
        targetValue: Number.isFinite(yMetricTarget) && yMetricTarget > 0 ? yMetricTarget : 1,
        unit: yMetricUnit || "units",
        currentValue: 0
      };
      years.push({
        index: n,
        title,
        why: yearWhy,
        metric: yearMetric,
        startDate: yStart,
        endDate: yEnd
      });
    } else {
      years.push({
        index: n,
        title,
        startDate: yStart,
        endDate: yEnd
      });
    }
  }

  const decadeStart = `${startYear}-01-01`;
  const decadeEnd = `${startYear + 9}-12-31`;

  const next = setupDecadeWizard(data, {
    decadeTitle,
    why,
    metric,
    decadeStart,
    decadeEnd,
    years
  });

  const wizard = el("goalWizard");
  delete wizard.dataset.open;
  setHidden(wizard, true);
  wizard.innerHTML = "";
  expandedGoalIds = new Set(next.goals.filter((g) => g.level === "decade" || g.level === "year").map((g) => g.id));
  persist(next);
}

function openDropGoalModal(goalId: string): void {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal) {
    return;
  }
  openModal(`
    <h3>Drop “${escapeHtml(goal.title)}”?</h3>
    <p>Choose how to handle children and linked tasks.</p>
    <div class="modal-actions">
      <button type="button" class="month-action-btn" data-drop-action="detach" data-drop-goal="${escapeHtml(goalId)}">Detach (keep children / unlink tasks)</button>
      <button type="button" class="month-action-btn danger-action-btn" data-drop-action="drop_children" data-drop-goal="${escapeHtml(goalId)}">Drop with children</button>
      <button type="button" class="month-action-btn" data-modal-close>Cancel</button>
    </div>`);
}

function addChildGoal(parentId: string): void {
  const parent = data.goals.find((g) => g.id === parentId);
  if (!parent) {
    return;
  }
  const level = childLevelFor(parent.level);
  if (!level) {
    return;
  }

  if (level === "month") {
    const monthStart = firstDayOfMonth(new Date().getFullYear(), new Date().getMonth());
    if (!isMonthPlanningUnlocked(data, monthStart)) {
      window.alert("Month planning is locked until the previous month's review is saved.");
      return;
    }
  }

  if (level === "month" || parent.level === "quarter") {
    // When adding a quarter goal under a year, warn if that year already has 2+? Spec: when adding quarter goal and count>=2
    // warnIfTooManyQuarterGoals checks children of a quarter — that would be months.
    // Re-read: "When adding quarter goal and count>=2" — so when adding a quarter under a year, if year already has >=2 quarters, warn.
    // But warnIfTooManyQuarterGoals(data, quarterId) counts children of a quarter (months).
    // Looking at goals.ts: countQuarterGoals counts children of quarterId.
    // The user said: "When adding quarter goal and count>=2, window.confirm warn but allow"
    // So when adding a quarter goal (level === "quarter"), check how many quarters the year already has.
    const existingQuarters = getChildren(data.goals, parentId).filter(
      (g) => g.level === "quarter" && g.status !== "dropped"
    ).length;
    if (level === "quarter" && existingQuarters >= 2) {
      if (
        !window.confirm(
          "This year already has 2+ quarter goals. Focus helps — add another anyway?"
        )
      ) {
        return;
      }
    }
    // Also use warnIfTooManyQuarterGoals when adding month under quarter
    if (level === "month" && warnIfTooManyQuarterGoals(data, parentId)) {
      if (
        !window.confirm(
          "This quarter already has 2+ month goals. Focus helps — add another anyway?"
        )
      ) {
        return;
      }
    }
  }

  const title = window.prompt(`New ${level} goal title:`);
  if (!title || !title.trim()) {
    return;
  }

  const input: Parameters<typeof createGoal>[1] = {
    level,
    parentId,
    title: title.trim(),
    status: "planned"
  };

  if (level === "month") {
    const now = new Date();
    input.startDate = firstDayOfMonth(now.getFullYear(), now.getMonth());
  }

  persist(createGoal(data, input));
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

function recurrenceFromForm(kind: string, everyN: number): Recurrence {
  if (kind === "weekdays") {
    return { kind: "weekdays" };
  }
  if (kind === "every_n") {
    return { kind: "every_n_days", n: Math.max(1, everyN || 2) };
  }
  return { kind: "daily" };
}

function renderTemplates(): void {
  const list = el("templateList");
  const goalSelect = el<HTMLSelectElement>("tmplGoal");
  fillMonthGoalSelect(goalSelect);

  const everyN = el<HTMLInputElement>("tmplEveryN");
  const recurrence = el<HTMLSelectElement>("tmplRecurrence");
  everyN.hidden = recurrence.value !== "every_n";

  if (data.templates.length === 0) {
    list.innerHTML = `<li class="template-empty">No templates yet.</li>`;
    return;
  }

  list.innerHTML = data.templates
    .map((tmpl) => {
      const goal = tmpl.goalId ? data.goals.find((g) => g.id === tmpl.goalId) : null;
      return `
        <li class="template-item${tmpl.active ? "" : " is-inactive"}" data-template-id="${escapeHtml(tmpl.id)}">
          <div class="template-main">
            <strong>${escapeHtml(tmpl.title)}</strong>
            <span>${escapeHtml(templateRecurrenceLabel(tmpl.recurrence))}</span>
            ${tmpl.plannedMinutes != null ? `<span>${tmpl.plannedMinutes}m</span>` : ""}
            ${tmpl.minimumVersion ? `<span>min: ${escapeHtml(tmpl.minimumVersion)}</span>` : ""}
            ${goal ? `<span>→ ${escapeHtml(goal.title)}</span>` : ""}
            <span>${tmpl.active ? "active" : "inactive"}</span>
          </div>
          <div class="template-actions">
            <button type="button" class="month-action-btn" data-tmpl-action="edit">Edit</button>
            <button type="button" class="month-action-btn" data-tmpl-action="toggle">${tmpl.active ? "Deactivate" : "Activate"}</button>
            <button type="button" class="month-action-btn danger-action-btn" data-tmpl-action="delete">Delete</button>
          </div>
        </li>`;
    })
    .join("");
}

function submitTemplateForm(form: HTMLFormElement): void {
  const title = el<HTMLInputElement>("tmplTitle").value.trim();
  if (!title) {
    return;
  }
  const recurrenceKind = el<HTMLSelectElement>("tmplRecurrence").value;
  const everyN = Number(el<HTMLInputElement>("tmplEveryN").value) || 2;
  const minutesRaw = el<HTMLInputElement>("tmplMinutes").value;
  const minutes = minutesRaw === "" ? null : Number(minutesRaw);
  const minimum = el<HTMLInputElement>("tmplMinimum").value.trim();
  const goalId = el<HTMLSelectElement>("tmplGoal").value || null;
  const recurrence = recurrenceFromForm(recurrenceKind, everyN);

  const input: Parameters<typeof addTemplate>[1] = {
    title,
    goalId,
    plannedMinutes: Number.isFinite(minutes as number) ? minutes : null,
    minimumVersion: minimum,
    recurrence
  };

  let next: PlannerData;
  if (editingTemplateId) {
    next = updateTemplate(data, editingTemplateId, {
      title,
      goalId,
      plannedMinutes: Number.isFinite(minutes as number) ? minutes : null,
      minimumVersion: minimum,
      recurrence
    });
    editingTemplateId = null;
    form.querySelector("button[type=submit]")!.textContent = "Add template";
  } else {
    next = addTemplate(data, input);
  }

  next = generateTasksFromTemplates(next);
  form.reset();
  el<HTMLInputElement>("tmplEveryN").value = "2";
  el<HTMLInputElement>("tmplEveryN").hidden = true;
  persist(next);
}

function loadTemplateIntoForm(tmpl: TaskTemplate): void {
  editingTemplateId = tmpl.id;
  el<HTMLInputElement>("tmplTitle").value = tmpl.title;
  const rec = el<HTMLSelectElement>("tmplRecurrence");
  const everyN = el<HTMLInputElement>("tmplEveryN");
  if (tmpl.recurrence.kind === "weekdays") {
    rec.value = "weekdays";
    everyN.hidden = true;
  } else if (tmpl.recurrence.kind === "every_n_days") {
    rec.value = "every_n";
    everyN.hidden = false;
    everyN.value = String(tmpl.recurrence.n);
  } else {
    rec.value = "daily";
    everyN.hidden = true;
  }
  el<HTMLInputElement>("tmplMinutes").value =
    tmpl.plannedMinutes != null ? String(tmpl.plannedMinutes) : "";
  el<HTMLInputElement>("tmplMinimum").value = tmpl.minimumVersion;
  el<HTMLSelectElement>("tmplGoal").value = tmpl.goalId ?? "";
  const submitBtn = el<HTMLFormElement>("templateForm").querySelector("button[type=submit]");
  if (submitBtn) {
    submitBtn.textContent = "Save template";
  }
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

function renderReviews(): void {
  const history = el("reviewHistory");
  const reviews = getReviews(data);
  if (reviews.length === 0) {
    history.innerHTML = `<li class="review-empty">No reviews yet.</li>`;
    return;
  }
  history.innerHTML = reviews
    .map(
      (r) => `
      <li class="review-history-item">
        <strong>${escapeHtml(r.type)}</strong>
        <span>${escapeHtml(r.periodStart)} → ${escapeHtml(r.periodEnd)}</span>
        <span class="review-date">${escapeHtml(new Date(r.createdAt).toLocaleString())}</span>
      </li>`
    )
    .join("");
}

function showReviewForm(html: string): void {
  const form = el("reviewForm");
  setHidden(form, false);
  form.innerHTML = html;
}

function hideReviewForm(): void {
  const form = el("reviewForm");
  setHidden(form, true);
  form.innerHTML = "";
}

function startWeeklyReview(): void {
  const prefill = prefillWeeklyReview(data);
  showReviewForm(`
    <h3>Weekly review</h3>
    <p>${escapeHtml(prefill.periodStart)} → ${escapeHtml(prefill.periodEnd)}</p>
    <ul class="review-stats">
      <li>Completed days: ${prefill.daysCompleted.length}</li>
      <li>Missed days: ${prefill.daysMissed.length}</li>
      <li>Rest days: ${prefill.daysRest.length}</li>
      <li>Skip reasons: ${
        prefill.skipReasons.length
          ? prefill.skipReasons.map((s) => `${s.reason} (${s.count})`).join(", ")
          : "none"
      }</li>
    </ul>
    <form id="weeklyReviewForm" class="review-answers">
      <label>What got in the way?
        <textarea class="habit-input" name="gotInWay" rows="3" required></textarea>
      </label>
      <label>Plan for next week?
        <textarea class="habit-input" name="nextPlan" rows="3" required></textarea>
      </label>
      <div class="modal-actions">
        <button type="button" class="month-action-btn" data-review-cancel>Cancel</button>
        <button type="submit" class="bg-blue-500 px-4 py-2">Save weekly review</button>
      </div>
    </form>`);
}

function startMonthlyReview(): void {
  const today = todayKey();
  const monthPrefix = today.slice(0, 7);
  const [y, m] = monthPrefix.split("-").map(Number);
  const periodStart = `${monthPrefix}-01`;
  const periodEnd = formatDateKey(y!, m! - 1, getDaysInMonth(y!, m! - 1));

  showReviewForm(`
    <h3>Monthly review</h3>
    <p>${escapeHtml(periodStart)} → ${escapeHtml(periodEnd)}</p>
    <form id="monthlyReviewForm" class="review-answers">
      <label>Did you hit the target?
        <select class="habit-input" name="hitTarget" required>
          <option value="yes">Yes</option>
          <option value="partial">Partial</option>
          <option value="no">No</option>
        </select>
      </label>
      <label>Why?
        <textarea class="habit-input" name="why" rows="3" required></textarea>
      </label>
      <label>Next month goal title (required)
        <input class="habit-input" name="nextGoalTitle" type="text" maxlength="120" required>
      </label>
      <label>Daily action template title (required)
        <input class="habit-input" name="nextTemplateTitle" type="text" maxlength="80" required>
      </label>
      <div class="modal-actions">
        <button type="button" class="month-action-btn" data-review-cancel>Cancel</button>
        <button type="submit" class="bg-blue-500 px-4 py-2">Save monthly review</button>
      </div>
    </form>`);
}

function startPeriodReview(type: "quarterly" | "annual"): void {
  const today = todayKey();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  let periodStart: string;
  let periodEnd: string;

  if (type === "annual") {
    periodStart = `${year}-01-01`;
    periodEnd = `${year}-12-31`;
  } else {
    const q = Math.floor((month - 1) / 3);
    const startMonth = q * 3;
    const endMonth = startMonth + 2;
    periodStart = firstDayOfMonth(year, startMonth);
    periodEnd = formatDateKey(year, endMonth, getDaysInMonth(year, endMonth));
  }

  showReviewForm(`
    <h3>${type === "annual" ? "Annual" : "Quarterly"} review</h3>
    <p>${escapeHtml(periodStart)} → ${escapeHtml(periodEnd)}</p>
    <form id="periodReviewForm" class="review-answers" data-review-type="${type}" data-start="${escapeHtml(periodStart)}" data-end="${escapeHtml(periodEnd)}">
      <label>Does the plan still make sense?
        <select class="habit-input" name="stillMakesSense" required>
          <option value="yes">Yes</option>
          <option value="adjust">Needs adjustment</option>
          <option value="no">No</option>
        </select>
      </label>
      <label>Notes
        <textarea class="habit-input" name="notes" rows="4"></textarea>
      </label>
      <div class="modal-actions">
        <button type="button" class="month-action-btn" data-review-cancel>Cancel</button>
        <button type="submit" class="bg-blue-500 px-4 py-2">Save review</button>
      </div>
    </form>`);
}

function submitWeeklyReview(form: HTMLFormElement): void {
  const fd = new FormData(form);
  const prefill = prefillWeeklyReview(data);
  const next = saveReview(data, {
    type: "weekly",
    periodStart: prefill.periodStart,
    periodEnd: prefill.periodEnd,
    answers: {
      gotInWay: String(fd.get("gotInWay") ?? "").trim(),
      nextPlan: String(fd.get("nextPlan") ?? "").trim(),
      prefill
    }
  });
  hideReviewForm();
  persist(next);
}

function submitMonthlyReview(form: HTMLFormElement): void {
  const fd = new FormData(form);
  const today = todayKey();
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const periodStart = `${today.slice(0, 7)}-01`;
  const periodEnd = formatDateKey(y!, m! - 1, getDaysInMonth(y!, m! - 1));

  const nextGoalTitle = String(fd.get("nextGoalTitle") ?? "").trim();
  const nextTemplateTitle = String(fd.get("nextTemplateTitle") ?? "").trim();
  if (!nextGoalTitle || !nextTemplateTitle) {
    window.alert("Next month goal title and daily action template are required.");
    return;
  }

  let nextMonth = m!;
  let nextYear = y!;
  nextMonth += 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const nextMonthStart = firstDayOfMonth(nextYear, nextMonth - 1);

  // Find an active quarter to attach the month goal, or create under first active year/quarter
  let parentQuarter = data.goals.find(
    (g) => g.level === "quarter" && g.status === "active"
  );
  if (!parentQuarter) {
    parentQuarter = data.goals.find(
      (g) => g.level === "quarter" && g.status !== "dropped"
    );
  }

  let next = data;
  if (!parentQuarter) {
    window.alert("Create a year/quarter goal first (activate a year) before saving a monthly review.");
    return;
  }

  next = createGoal(next, {
    level: "month",
    parentId: parentQuarter.id,
    title: nextGoalTitle,
    status: "planned",
    startDate: nextMonthStart
  });

  const newMonth = getMonthGoals(next).find(
    (g) => g.title === nextGoalTitle && g.startDate === nextMonthStart
  );
  if (!newMonth) {
    return;
  }

  next = addTemplate(next, {
    title: nextTemplateTitle,
    goalId: newMonth.id,
    recurrence: { kind: "weekdays" },
    startDate: nextMonthStart
  });

  const newTemplate = next.templates[next.templates.length - 1];
  if (!newTemplate || !canCompleteMonthlyReview(next, newMonth.id, [newTemplate.id])) {
    window.alert("Could not complete monthly review requirements.");
    return;
  }

  next = saveReview(next, {
    type: "monthly",
    periodStart,
    periodEnd,
    answers: {
      hitTarget: String(fd.get("hitTarget") ?? ""),
      why: String(fd.get("why") ?? "").trim(),
      nextMonthGoalId: newMonth.id,
      nextTemplateIds: [newTemplate.id]
    }
  });

  next = generateTasksFromTemplates(next);
  hideReviewForm();
  persist(next);
}

function submitPeriodReview(form: HTMLFormElement): void {
  const type = form.dataset.reviewType as ReviewType;
  const periodStart = form.dataset.start ?? todayKey();
  const periodEnd = form.dataset.end ?? todayKey();
  const fd = new FormData(form);
  const next = saveReview(data, {
    type,
    periodStart,
    periodEnd,
    answers: {
      stillMakesSense: String(fd.get("stillMakesSense") ?? ""),
      notes: String(fd.get("notes") ?? "").trim()
    }
  });
  hideReviewForm();
  persist(next);
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

function renderStats(): void {
  const summary = el("statsSummary");
  const heatmap = el("heatmap");
  const skipHost = el("skipAnalytics");
  const energyHost = el("energyAnalytics");

  const streaks = computeStreakStats(data);
  summary.innerHTML = `
    <div class="stat-card"><span>Current streak</span><strong>${streaks.current}</strong></div>
    <div class="stat-card"><span>Longest streak</span><strong>${streaks.longest}</strong></div>
    <div class="stat-card"><span>Never miss twice</span><strong>${streaks.neverMissTwice ? "Protect today" : "OK"}</strong></div>`;

  const end = todayKey();
  const start = addDays(end, -89);
  const days = buildHeatmap(data, start, end);
  heatmap.innerHTML = days
    .map((day) => {
      let level = 0;
      if (day.isRestDay) {
        level = -1;
      } else if (day.hasTasks) {
        level = Math.min(4, Math.ceil(day.percent / 25));
      }
      return `<button type="button" class="heat-cell level-${level}" title="${escapeHtml(day.date)}: ${day.isRestDay ? "rest" : `${day.percent}%`}" data-heat-day="${escapeHtml(day.date)}"></button>`;
    })
    .join("");

  const skips = skipReasonAnalytics(data);
  skipHost.innerHTML =
    skips.every((s) => s.count === 0)
      ? `<p>No skip reasons yet (legacy imports excluded).</p>`
      : `<ul>${skips
          .map(
            (s) =>
              `<li><span>${escapeHtml(SKIP_REASON_LABELS[s.reason])}</span> <strong>${s.count}</strong></li>`
          )
          .join("")}</ul>`;

  const points = energyVsCompletion(data);
  const corr = correlationEnergyCompletion(points);
  energyHost.innerHTML = `
    <p>Correlation (energy vs completion): <strong>${corr === null ? "n/a" : corr}</strong> (${points.length} days)</p>
    ${
      points.length === 0
        ? `<p>Log evening energy to see this chart.</p>`
        : `<ul>${points
            .slice(-14)
            .map(
              (p) =>
                `<li>${escapeHtml(p.date)} — energy ${p.energy}, completion ${p.completionPercent}%</li>`
            )
            .join("")}</ul>`
    }`;
}

/* ------------------------------------------------------------------ */
/* Deadlines                                                           */
/* ------------------------------------------------------------------ */

function renderDeadlines(): void {
  const list = el("plannerDeadlineList");
  const sorted = sortDeadlineQuests(deadlineQuests);
  if (sorted.length === 0) {
    list.innerHTML = `<li class="deadline-empty">No unavoidable quests.</li>`;
    return;
  }

  list.innerHTML = sorted
    .map((quest) => {
      const overdue = isOverdue(quest);
      const dueToday = isDueToday(quest);
      const classes = [
        "deadline-item",
        quest.done ? "is-done" : "",
        overdue ? "is-overdue" : "",
        dueToday ? "is-due-today" : ""
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <li class="${classes}" data-deadline-id="${escapeHtml(quest.id)}">
          <div class="deadline-main">
            <label class="deadline-check">
              <input type="checkbox" data-deadline-toggle ${quest.done ? "checked" : ""}>
              <span class="deadline-title">${escapeHtml(quest.title)}</span>
            </label>
            <div class="deadline-meta">
              <span class="deadline-date">${escapeHtml(formatDeadlineLabel(quest.deadline))}</span>
              <span class="deadline-priority priority-${escapeHtml(quest.priority)}">${escapeHtml(quest.priority)}</span>
              ${overdue ? `<span class="deadline-status">Overdue</span>` : ""}
              ${dueToday ? `<span class="deadline-status">Due today</span>` : ""}
            </div>
            ${quest.notes ? `<p class="deadline-notes">${escapeHtml(quest.notes)}</p>` : ""}
          </div>
          <div class="deadline-item-actions">
            <button type="button" class="month-action-btn deadline-remove-btn" data-deadline-remove aria-label="Remove">×</button>
          </div>
        </li>`;
    })
    .join("");
}

function persistDeadlines(next: DeadlineQuest[]): void {
  deadlineQuests = next;
  saveDeadlineQuests(deadlineQuests);
  renderDeadlines();
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function renderSettings(): void {
  el<HTMLSelectElement>("weekStartsOn").value = String(data.settings.weekStartsOn);
  const r = data.settings.reminders;
  el<HTMLInputElement>("remMorning").checked = r.morningEnabled;
  el<HTMLInputElement>("remMorningTime").value = r.morningTime;
  el<HTMLInputElement>("remEvening").checked = r.eveningEnabled;
  el<HTMLInputElement>("remEveningTime").value = r.eveningTime;
  el<HTMLInputElement>("remSunday").checked = r.sundayReviewEnabled;
  el<HTMLInputElement>("remSundayTime").value = r.sundayReviewTime;
  el<HTMLInputElement>("remMonthEnd").checked = r.monthEndEnabled;
  el<HTMLInputElement>("remMonthEndTime").value = r.monthEndTime;
}

function saveSettingsFromForm(): void {
  const weekStartsOn = el<HTMLSelectElement>("weekStartsOn").value === "1" ? 1 : 0;
  persist({
    ...data,
    settings: {
      weekStartsOn,
      reminders: {
        morningEnabled: el<HTMLInputElement>("remMorning").checked,
        morningTime: el<HTMLInputElement>("remMorningTime").value || "08:00",
        eveningEnabled: el<HTMLInputElement>("remEvening").checked,
        eveningTime: el<HTMLInputElement>("remEveningTime").value || "21:00",
        sundayReviewEnabled: el<HTMLInputElement>("remSunday").checked,
        sundayReviewTime: el<HTMLInputElement>("remSundayTime").value || "18:00",
        monthEndEnabled: el<HTMLInputElement>("remMonthEnd").checked,
        monthEndTime: el<HTMLInputElement>("remMonthEndTime").value || "19:00"
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function bindEvents(): void {
  if (eventsBound) {
    return;
  }
  eventsBound = true;

  document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nav = btn.dataset.nav;
      if (nav && isPlannerView(nav)) {
        switchView(nav);
      }
    });
  });

  el<HTMLInputElement>("todayDatePicker").addEventListener("change", (e) => {
    const value = (e.target as HTMLInputElement).value;
    if (isValidDateKey(value)) {
      selectedDate = value;
      renderToday();
    }
  });

  el<HTMLInputElement>("restDayToggle").addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    persist(setRestDay(data, selectedDate, checked));
  });

  el<HTMLFormElement>("quickAddForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = el<HTMLInputElement>("quickAddTitle").value.trim();
    const date = el<HTMLInputElement>("quickAddDate").value;
    const goalRaw = el<HTMLSelectElement>("quickAddGoal").value;
    if (!title || !isValidDateKey(date)) {
      return;
    }
    const input: Parameters<typeof addTask>[1] = { title, date };
    input.goalId = goalRaw ? goalRaw : null;
    persist(addTask(data, input));
    el<HTMLInputElement>("quickAddTitle").value = "";
  });

  el("taskList").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const actionBtn = target.closest<HTMLElement>("[data-task-action]");
    const item = target.closest<HTMLElement>("[data-task-id]");
    if (!actionBtn || !item || !item.dataset.taskId) {
      return;
    }
    handleTaskAction(item.dataset.taskId, actionBtn.dataset.taskAction ?? "");
  });

  el("calPrevBtn").addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  el("calNextBtn").addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    renderCalendar();
  });
  el("calendarGrid").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-cal-day]");
    if (!btn?.dataset.calDay) {
      return;
    }
    calendarSelectedDay = btn.dataset.calDay;
    renderCalendar();
  });
  el("calendarDayDetail").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-cal-open-today]");
    if (!btn?.dataset.calOpenToday) {
      return;
    }
    selectedDate = btn.dataset.calOpenToday;
    switchView("today");
  });

  el("startWizardBtn").addEventListener("click", () => openDecadeWizard());
  el("goalsTree").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const toggle = target.closest<HTMLElement>("[data-goal-toggle]");
    if (toggle?.dataset.goalToggle) {
      const id = toggle.dataset.goalToggle;
      if (expandedGoalIds.has(id)) {
        expandedGoalIds.delete(id);
      } else {
        expandedGoalIds.add(id);
      }
      renderGoals();
      return;
    }
    const select = target.closest<HTMLElement>("[data-goal-select]");
    if (select?.dataset.goalSelect) {
      selectedGoalId = select.dataset.goalSelect;
      expandedGoalIds.add(selectedGoalId);
      renderGoals();
    }
  });

  el("goalDetail").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const editId = target.closest<HTMLElement>("[data-goal-edit]")?.dataset.goalEdit;
    if (editId) {
      const goal = data.goals.find((g) => g.id === editId);
      if (!goal) return;
      const title = window.prompt("Title:", goal.title);
      if (title === null || !title.trim()) return;
      const why = window.prompt("Why:", goal.why);
      if (why === null) return;
      persist(updateGoal(data, editId, { title: title.trim(), why: why.trim() }));
      return;
    }
    const addChildId = target.closest<HTMLElement>("[data-goal-add-child]")?.dataset.goalAddChild;
    if (addChildId) {
      addChildGoal(addChildId);
      return;
    }
    const activateId = target.closest<HTMLElement>("[data-goal-activate-year]")?.dataset
      .goalActivateYear;
    if (activateId) {
      if (!window.confirm("Activate this year and create Q1–Q4 if missing?")) {
        return;
      }
      persist(activateYearAndPromptQuarters(data, activateId));
      return;
    }
    const dropId = target.closest<HTMLElement>("[data-goal-drop]")?.dataset.goalDrop;
    if (dropId) {
      openDropGoalModal(dropId);
      return;
    }
    const suggestId = target.closest<HTMLElement>("[data-goal-apply-suggestions]")?.dataset
      .goalApplySuggestions;
    if (suggestId) {
      const goal = data.goals.find((g) => g.id === suggestId);
      if (!goal) return;
      let next = data;
      for (const suggestion of suggestDailyActions(goal)) {
        next = addTemplate(next, {
          title: suggestion.title,
          goalId: goal.id,
          plannedMinutes: suggestion.plannedMinutes,
          recurrence: { kind: suggestion.recurrence }
        });
      }
      next = generateTasksFromTemplates(next);
      persist(next);
    }
  });

  el("goalWizard").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "cancelWizardBtn") {
      const wizard = el("goalWizard");
      delete wizard.dataset.open;
      setHidden(wizard, true);
      wizard.innerHTML = "";
    }
  });
  el("goalWizard").addEventListener("submit", (e) => {
    const form = e.target as HTMLElement;
    if (form.id !== "decadeWizardForm") {
      return;
    }
    e.preventDefault();
    submitDecadeWizard(form as HTMLFormElement);
  });

  el<HTMLSelectElement>("tmplRecurrence").addEventListener("change", () => {
    el<HTMLInputElement>("tmplEveryN").hidden =
      el<HTMLSelectElement>("tmplRecurrence").value !== "every_n";
  });

  el<HTMLFormElement>("templateForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitTemplateForm(e.target as HTMLFormElement);
  });

  el("templateList").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLElement>("[data-template-id]");
    const action = target.closest<HTMLElement>("[data-tmpl-action]")?.dataset.tmplAction;
    if (!item?.dataset.templateId || !action) {
      return;
    }
    const id = item.dataset.templateId;
    const tmpl = data.templates.find((t) => t.id === id);
    if (!tmpl) return;

    if (action === "edit") {
      loadTemplateIntoForm(tmpl);
      return;
    }
    if (action === "toggle") {
      let next = updateTemplate(data, id, { active: !tmpl.active });
      next = generateTasksFromTemplates(next);
      persist(next);
      return;
    }
    if (action === "delete") {
      if (!window.confirm(`Delete template "${tmpl.title}"?`)) return;
      persist(deleteTemplate(data, id));
    }
  });

  el("startWeeklyReviewBtn").addEventListener("click", () => startWeeklyReview());
  el("startMonthlyReviewBtn").addEventListener("click", () => startMonthlyReview());
  el("startQuarterlyReviewBtn").addEventListener("click", () => startPeriodReview("quarterly"));
  el("startAnnualReviewBtn").addEventListener("click", () => startPeriodReview("annual"));

  el("reviewForm").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-review-cancel]")) {
      hideReviewForm();
    }
  });
  el("reviewForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    if (form.id === "weeklyReviewForm") {
      submitWeeklyReview(form);
    } else if (form.id === "monthlyReviewForm") {
      submitMonthlyReview(form);
    } else if (form.id === "periodReviewForm") {
      submitPeriodReview(form);
    }
  });

  el("heatmap").addEventListener("click", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-heat-day]");
    if (!cell?.dataset.heatDay) return;
    selectedDate = cell.dataset.heatDay;
    switchView("today");
  });

  el<HTMLFormElement>("plannerDeadlineForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = el<HTMLInputElement>("pDeadlineTitle").value.trim();
    const deadline = el<HTMLInputElement>("pDeadlineDate").value;
    const priority = el<HTMLSelectElement>("pDeadlinePriority").value as QuestPriority;
    const notes = el<HTMLInputElement>("pDeadlineNotes").value.trim();
    if (!title || !deadline) return;
    const input: Parameters<typeof addDeadlineQuest>[1] = {
      title,
      deadline,
      priority
    };
    if (notes) {
      input.notes = notes;
    }
    persistDeadlines(addDeadlineQuest(deadlineQuests, input));
    (e.target as HTMLFormElement).reset();
  });

  el("plannerDeadlineList").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLElement>("[data-deadline-id]");
    if (!item?.dataset.deadlineId) return;
    const id = item.dataset.deadlineId;
    if (target.closest("[data-deadline-remove]")) {
      persistDeadlines(removeDeadlineQuest(deadlineQuests, id));
      return;
    }
    if (target.closest("[data-deadline-toggle]")) {
      persistDeadlines(toggleDeadlineQuestDone(deadlineQuests, id));
    }
  });

  el<HTMLFormElement>("settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettingsFromForm();
  });

  el("rollbackBtn").addEventListener("click", () => {
    if (!window.confirm("Switch back to the legacy tracker? Planner data is kept.")) {
      return;
    }
    rollbackToLegacy();
    window.location.reload();
  });

  el("remigrateBtn").addEventListener("click", () => {
    if (
      !window.confirm(
        "Reset planner data and re-migrate from the legacy grid? This cannot be undone."
      )
    ) {
      return;
    }
    runMigration({ forceReset: true });
    window.location.reload();
  });

  el("catchUpPanel").addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>("[data-catchup]")?.dataset
      .catchup;
    if (!action) return;
    if (action === "move") {
      catchUpDismissed = true;
      persist(moveBacklogToToday(data));
      return;
    }
    if (action === "skip") {
      openSkipAllModal();
      return;
    }
    if (action === "fresh") {
      if (!window.confirm("Mark all backlog todos as skipped (fresh start)?")) return;
      catchUpDismissed = true;
      persist(freshStartBacklog(data, "other"));
      return;
    }
    if (action === "details") {
      openCatchUpDetails();
    }
  });

  el("reminderBanners").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const dismissKind = target.closest<HTMLElement>("[data-reminder-dismiss]")?.dataset
      .reminderDismiss;
    if (dismissKind) {
      handleReminderAction(
        { id: dismissKind, title: "", body: "", kind: dismissKind as ReminderBanner["kind"] },
        "dismiss"
      );
      return;
    }
    const cta = target.closest<HTMLElement>("[data-reminder-cta]")?.dataset.reminderCta;
    if (cta === "checkin") {
      handleReminderAction(
        { id: "evening", title: "", body: "", kind: "evening" },
        "cta"
      );
    } else if (cta === "weekly") {
      handleReminderAction({ id: "sunday", title: "", body: "", kind: "sunday" }, "cta");
    } else if (cta === "monthly") {
      handleReminderAction({ id: "month_end", title: "", body: "", kind: "month_end" }, "cta");
    }
  });

  el("plannerModal").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "plannerModal" || target.closest("[data-modal-close]")) {
      closeModal();
      return;
    }

    const skipTask = target.closest<HTMLElement>("[data-skip-task]");
    if (skipTask?.dataset.skipTask && skipTask.dataset.skipReason) {
      const reason = skipTask.dataset.skipReason;
      if (isSkipReason(reason)) {
        closeModal();
        persist(markSkipped(data, skipTask.dataset.skipTask, reason));
      }
      return;
    }

    const skipAll = target.closest<HTMLElement>("[data-skip-all]")?.dataset.skipAll;
    if (skipAll && isSkipReason(skipAll)) {
      closeModal();
      catchUpDismissed = true;
      persist(skipBacklog(data, skipAll));
      return;
    }

    const dropAction = target.closest<HTMLElement>("[data-drop-action]");
    if (dropAction?.dataset.dropAction && dropAction.dataset.dropGoal) {
      const action = dropAction.dataset.dropAction;
      const goalId = dropAction.dataset.dropGoal;
      closeModal();
      if (action === "detach" || action === "drop_children") {
        selectedGoalId = null;
        persist(deleteOrDropGoal(data, goalId, { action }));
      }
    }
  });

  el("plannerModalCard").addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (form.id === "checkInForm") {
      e.preventDefault();
      submitCheckIn(form);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function bootPlanner(): void {
  const plannerApp = document.getElementById("plannerApp");
  const legacyApp = document.getElementById("legacyApp");
  setHidden(plannerApp, false);
  setHidden(legacyApp, true);

  const existing = loadPlannerData();
  if (!existing) {
    runMigration();
  }

  let loaded = loadPlannerData() ?? createEmptyPlannerData();
  loaded = generateTasksFromTemplates(loaded);
  savePlannerData(loaded);
  data = loaded;

  selectedDate = todayKey();
  calendarCursor = new Date();
  deadlineQuests = loadDeadlineQuests();

  // Expand decade/year by default when present
  for (const g of data.goals) {
    if (g.level === "decade" || (g.level === "year" && g.status === "active")) {
      expandedGoalIds.add(g.id);
    }
  }

  bindEvents();
  switchView("today");
}

bootPlanner();
