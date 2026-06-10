import { Habit, ManMilestone, SideQuest } from "./types";
import {
  addHabit,
  calculateStats,
  clearMonthHabits,
  formatDateKey,
  formatMonthKey,
  getCellState,
  getColorByIndex,
  getDaysInMonth,
  getMonthData,
  loadHabitsData,
  removeHabit,
  renameHabit,
  saveHabitsData,
  setCellState,
  setMonthData
} from "./habits";

const monthLabel = document.getElementById("monthLabel");
const habitGrid = document.getElementById("habitGrid");
const statCounters = document.getElementById("statCounters");
const progressCharts = document.getElementById("progressCharts");
const trackerFlipCard = document.getElementById("trackerFlipCard");
const toggleStatsFlipBtn = document.getElementById("toggleStatsFlipBtn") as HTMLButtonElement | null;
const toggleStatsBackBtn = document.getElementById("toggleStatsBackBtn") as HTMLButtonElement | null;
const statsBackMonth = document.getElementById("statsBackMonth");
const sideQuestInput = document.getElementById("sideQuestInput") as HTMLInputElement | null;
const addSideQuestBtn = document.getElementById("addSideQuestBtn") as HTMLButtonElement | null;
const sideQuestList = document.getElementById("sideQuestList");
const manMilestoneInput = document.getElementById("manMilestoneInput") as HTMLInputElement | null;
const addManMilestoneBtn = document.getElementById("addManMilestoneBtn") as HTMLButtonElement | null;
const manMilestoneList = document.getElementById("manMilestoneList");
const addHabitBtn = document.getElementById("addHabitBtn") as HTMLButtonElement | null;
const copyHabitsBtn = document.getElementById("copyHabitsBtn") as HTMLButtonElement | null;
const pasteHabitsBtn = document.getElementById("pasteHabitsBtn") as HTMLButtonElement | null;
const deleteAllHabitsBtn = document.getElementById("deleteAllHabitsBtn") as HTMLButtonElement | null;
const clipboardStatus = document.getElementById("clipboardStatus");
const newHabitInput = document.getElementById("newHabitInput") as HTMLInputElement | null;
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const deleteMonthModal = document.getElementById("deleteMonthModal");
const deleteModalMonthLabel = document.getElementById("deleteModalMonthLabel");
const cancelDeleteMonthBtn = document.getElementById("cancelDeleteMonthBtn") as HTMLButtonElement | null;
const confirmDeleteMonthBtn = document.getElementById("confirmDeleteMonthBtn") as HTMLButtonElement | null;

let data = loadHabitsData();
let currentView = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let isStatsFlipped = false;

const CLIPBOARD_STORAGE_KEY = "humanos_habits_month_clipboard_v1";
const MAX_HABITS = 10;

type HabitsClipboard = {
  sourceMonthKey: string;
  sourceMonthLabel: string;
  copiedAt: string;
  habits: Habit[];
};

const CHECK_ICON = `<svg class="cell-icon cell-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 10 18 20 6"/></svg>`;

const CROSS_ICON = `<svg class="cell-icon cell-cross" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;

const clickSound = new Audio("/sound-effects/Click.mp3");
clickSound.volume = 0.5;

function playCellSound(): void {
  clickSound.currentTime = 0;
  clickSound.play().catch(() => {});
}

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("button")) {
    playCellSound();
  }
});

function getMonthTitle(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function makeMonthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function createHabitId(): string {
  return `habit-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function createSideQuestId(): string {
  return `side-quest-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function createManMilestoneId(): string {
  return `man-milestone-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function parseClipboard(): HabitsClipboard | null {
  const raw = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as HabitsClipboard;
    if (!parsed || !Array.isArray(parsed.habits)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function updateClipboardUi(message?: string): void {
  const clipboard = parseClipboard();
  if (pasteHabitsBtn) {
    pasteHabitsBtn.disabled = !clipboard;
  }

  if (!clipboardStatus) {
    return;
  }

  if (message) {
    clipboardStatus.textContent = message;
    return;
  }

  clipboardStatus.textContent = clipboard
    ? `Copied from ${clipboard.sourceMonthLabel}`
    : "";
}

function updateMonthActionUi(): void {
  if (!deleteAllHabitsBtn) {
    return;
  }

  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();
  const monthData = getMonthData(data, year, monthIndex);
  deleteAllHabitsBtn.disabled = monthData.habits.length === 0;
}

function setDeleteMonthModalOpen(open: boolean): void {
  if (!deleteMonthModal) {
    return;
  }

  deleteMonthModal.classList.toggle("is-open", open);
  deleteMonthModal.setAttribute("aria-hidden", open ? "false" : "true");
}

function normalizeHabitName(name: string): string {
  return name.trim().toLowerCase();
}

function pasteClipboardIntoCurrentMonth(mode: "replace" | "merge"): boolean {
  const clipboard = parseClipboard();
  if (!clipboard) {
    updateClipboardUi("Nothing copied yet");
    return false;
  }

  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();
  const destinationMonthData = getMonthData(data, year, monthIndex);

  if (mode === "replace") {
    const habits = clipboard.habits.slice(0, MAX_HABITS).map((habit) => ({ ...habit }));
    const log = {};

    data = setMonthData(data, year, monthIndex, { habits, log });
    persistAndRender();
    updateClipboardUi(`Replaced quests in ${makeMonthLabel(year, monthIndex)} (fresh month state)`);
    return true;
  }

  const existingByName = new Map(
    destinationMonthData.habits.map((habit) => [normalizeHabitName(habit.name), habit])
  );

  const habits = [...destinationMonthData.habits];
  const habitIdMap: Record<string, string> = {};

  for (const copiedHabit of clipboard.habits) {
    const normalizedName = normalizeHabitName(copiedHabit.name);
    const existing = existingByName.get(normalizedName);

    if (existing) {
      continue;
    }

    if (habits.length >= MAX_HABITS) {
      continue;
    }

    const newHabit = {
      ...copiedHabit,
      id: createHabitId()
    };

    habits.push(newHabit);
    existingByName.set(normalizedName, newHabit);
  }

  // Paste should only copy quest definitions, never progress/history.
  const log = { ...destinationMonthData.log };

  data = setMonthData(data, year, monthIndex, { habits, log });
  persistAndRender();
  updateClipboardUi(`Merged quest definitions into ${makeMonthLabel(year, monthIndex)}`);
  return true;
}

function getWeekSegments(daysInMonth: number): Array<{ start: number; end: number }> {
  const segments: Array<{ start: number; end: number }> = [];

  for (let start = 1; start <= daysInMonth; start += 7) {
    segments.push({
      start,
      end: Math.min(start + 6, daysInMonth)
    });
  }

  return segments;
}

function getWeekDayLabel(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day).toLocaleDateString("en-US", {
    weekday: "short"
  });
}

function renderDonut(percent: number, title: string, detail: string): string {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const safePercent = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - safePercent / 100);

  return `
    <article class="donut-chart">
      <svg viewBox="0 0 90 90" class="donut-svg" aria-hidden="true">
        <circle class="donut-track" cx="45" cy="45" r="${radius}"></circle>
        <circle
          class="donut-progress"
          cx="45"
          cy="45"
          r="${radius}"
          style="stroke-dasharray:${circumference};stroke-dashoffset:${offset};"
        ></circle>
      </svg>
      <div class="donut-value">${safePercent}%</div>
      <h4 class="donut-title">${title}</h4>
      <p class="donut-detail">${detail}</p>
    </article>
  `;
}

function renderGrid(year: number, monthIndex: number): void {
  if (!habitGrid) {
    return;
  }

  const monthData = getMonthData(data, year, monthIndex);
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const weekSegments = getWeekSegments(daysInMonth);

  const weekHeaderCells = weekSegments
    .map(
      (segment, index) =>
        `<th class="week-header" colspan="${segment.end - segment.start + 1}">
          Week ${index + 1}
        </th>`
    )
    .join("");

  const dateHeaderCells = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `<th class="date-header">${day}</th>`;
  }).join("");

  const dayLabelCells = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `<th class="day-label-header">${getWeekDayLabel(year, monthIndex, day)}</th>`;
  }).join("");

  const habitRows = monthData.habits
    .map((habit) => renderHabitRow(habit, year, monthIndex, daysInMonth))
    .join("");

  habitGrid.innerHTML = `
    <div class="habit-grid-scroll">
      <table class="habit-grid" role="grid">
        <thead>
          <tr>
            <th class="sticky-col habit-column-header" rowspan="3">Quests</th>
            ${weekHeaderCells}
          </tr>
          <tr>${dateHeaderCells}</tr>
          <tr>${dayLabelCells}</tr>
        </thead>
        <tbody>${habitRows}</tbody>
      </table>
    </div>
  `;
}

function renderHabitRow(habit: Habit, year: number, monthIndex: number, daysInMonth: number): string {
  const monthData = getMonthData(data, year, monthIndex);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const dateKey = formatDateKey(year, monthIndex, day);
    const state = getCellState(monthData, habit.id, dateKey);
    const stateClass = state === "check" ? "state-check" : state === "cross" ? "state-cross" : "";
    const cellDate = new Date(year, monthIndex, day);
    const isLocked = cellDate < today;
    const lockedClass = isLocked ? "cell-locked" : "";

    return `
      <td>
        <div
          class="habit-cell ${stateClass} ${lockedClass}"
          data-action="${isLocked ? "" : "toggle-cell"}"
          data-habit-id="${habit.id}"
          data-date-key="${dateKey}"
          aria-label="${habit.name} on ${dateKey}${isLocked ? " (locked)" : ""}"
        >
          <span class="cell-check-wrap">${CHECK_ICON}</span>
          <span class="cell-cross-wrap">${CROSS_ICON}</span>
        </div>
      </td>
    `;
  }).join("");

  return `
    <tr>
      <th class="sticky-col habit-name-cell">
        <button
          type="button"
          class="habit-name-btn"
          data-action="rename-habit"
          data-habit-id="${habit.id}"
        >
          ${habit.name}
        </button>
        <button
          type="button"
          class="habit-remove-btn"
          data-action="remove-habit"
          data-habit-id="${habit.id}"
          aria-label="Remove quest ${habit.name}"
        >&times;</button>
      </th>
      ${cells}
    </tr>
  `;
}

function renderSideQuestList(): void {
  if (!sideQuestList) {
    return;
  }

  if (data.sideQuests.length === 0) {
    sideQuestList.innerHTML = `<li class="analytics-empty">No side quests yet.</li>`;
    return;
  }

  sideQuestList.innerHTML = data.sideQuests
    .map(
      (item: SideQuest) => `
        <li class="analytics-list-item">
          <span class="analytics-item-text">${item.text}</span>
          <button
            type="button"
            class="analytics-remove-btn"
            data-action="remove-side-quest"
            data-side-quest-id="${item.id}"
            aria-label="Remove side quest ${item.text}"
          >&times;</button>
        </li>
      `
    )
    .join("");
}

function renderManMilestoneList(): void {
  if (!manMilestoneList) {
    return;
  }

  if (data.manMilestones.length === 0) {
    manMilestoneList.innerHTML = `<li class="analytics-empty">No milestones yet.</li>`;
    return;
  }

  manMilestoneList.innerHTML = data.manMilestones
    .map(
      (item: ManMilestone) => `
        <li class="analytics-list-item checklist-item">
          <label class="checklist-label">
            <input
              type="checkbox"
              data-action="toggle-man-milestone"
              data-man-milestone-id="${item.id}"
              ${item.done ? "checked" : ""}
            >
            <span class="analytics-item-text ${item.done ? "is-done" : ""}">${item.text}</span>
          </label>
          <button
            type="button"
            class="analytics-remove-btn"
            data-action="remove-man-milestone"
            data-man-milestone-id="${item.id}"
            aria-label="Remove milestone ${item.text}"
          >&times;</button>
        </li>
      `
    )
    .join("");
}

function renderStats(year: number, monthIndex: number): void {
  if (!statCounters || !progressCharts) {
    return;
  }

  const monthData = getMonthData(data, year, monthIndex);
  const stats = calculateStats(monthData, year, monthIndex);
  const monthName = makeMonthLabel(year, monthIndex);

  if (statsBackMonth) {
    statsBackMonth.textContent = monthName;
  }

  statCounters.innerHTML = `
    <article class="stat-card">
      <h4>Quests Completed</h4>
      <strong>${stats.todayCompleted}</strong>
      <p>Today</p>
    </article>
    <article class="stat-card">
      <h4>Weekly Quests Completed</h4>
      <strong>${stats.currentWeekCompleted}</strong>
      <p>Week ${stats.currentWeekIndex + 1}</p>
    </article>
    <article class="stat-card">
      <h4>Monthly Quests Completed</h4>
      <strong>${stats.currentMonthCompleted}</strong>
      <p>${stats.monthlyPercent}% of target</p>
    </article>
  `;

  const weeklyDonuts = stats.weeklyPercent
    .map((percentage, index) =>
      renderDonut(
        percentage,
        `Week ${index + 1}`,
        `${stats.weeklyCompleted[index]} / ${stats.weeklyPossible[index]}`
      )
    )
    .join("");

  const totalDonut = renderDonut(
    stats.monthlyPercent,
    "Total Monthly Progress",
    `${stats.currentMonthCompleted} / ${stats.monthlyPossible}`
  );

  progressCharts.innerHTML = `${weeklyDonuts}${totalDonut}`;
  renderSideQuestList();
  renderManMilestoneList();
}

function setStatsFlipped(nextState: boolean): void {
  isStatsFlipped = nextState;
  if (!trackerFlipCard) {
    return;
  }

  trackerFlipCard.classList.toggle("is-flipped", isStatsFlipped);
}

function persistAndRender(): void {
  saveHabitsData(data);
  render();
}

function updateCellDom(cellEl: HTMLElement, nextState: "check" | "cross" | null): void {
  cellEl.classList.remove("state-check", "state-cross");
  if (nextState) {
    cellEl.classList.add(`state-${nextState}`);
  }
}

function persistOnly(): void {
  saveHabitsData(data);
  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();
  renderStats(year, monthIndex);
}

function render(): void {
  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();

  if (monthLabel) {
    monthLabel.textContent = getMonthTitle(currentView);
  }

  renderGrid(year, monthIndex);
  renderStats(year, monthIndex);
  updateMonthActionUi();
}

function handleGridClick(event: Event): void {
  const target = event.target as HTMLElement;
  const actionEl = target.closest<HTMLElement>("[data-action]");

  if (!actionEl) {
    return;
  }

  const action = actionEl.dataset.action;
  const habitId = actionEl.dataset.habitId;
  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();

  if (action === "toggle-cell" && habitId && actionEl.dataset.dateKey) {
    const monthData = getMonthData(data, year, monthIndex);
    const currentState = getCellState(monthData, habitId, actionEl.dataset.dateKey);
    const nextState = currentState === "check" ? null : "check" as const;
    data = setCellState(data, year, monthIndex, habitId, actionEl.dataset.dateKey, nextState);
    updateCellDom(actionEl, nextState);
    if (nextState) playCellSound();
    persistOnly();
    return;
  }

  if (action === "remove-habit" && habitId) {
    data = removeHabit(data, year, monthIndex, habitId);
    persistAndRender();
    return;
  }

  if (action === "rename-habit" && habitId) {
    const monthData = getMonthData(data, year, monthIndex);
    const currentHabit = monthData.habits.find((habit) => habit.id === habitId);
    if (!currentHabit) {
      return;
    }

    const nextName = window.prompt("Rename quest", currentHabit.name);
    if (!nextName) {
      return;
    }

    data = renameHabit(data, year, monthIndex, habitId, nextName);
    persistAndRender();
  }
}

function handleAddHabit(): void {
  if (!newHabitInput) {
    return;
  }

  const name = newHabitInput.value.trim();
  if (!name) {
    return;
  }

  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();
  const monthData = getMonthData(data, year, monthIndex);
  const color = getColorByIndex(monthData.habits.length);
  data = addHabit(data, year, monthIndex, name, color);
  newHabitInput.value = "";
  persistAndRender();
}

function handleAddSideQuest(): void {
  if (!sideQuestInput) {
    return;
  }

  const text = sideQuestInput.value.trim();
  if (!text) {
    return;
  }

  data = {
    ...data,
    sideQuests: [...data.sideQuests, { id: createSideQuestId(), text }]
  };

  sideQuestInput.value = "";
  saveHabitsData(data);
  renderSideQuestList();
}

function handleAddManMilestone(): void {
  if (!manMilestoneInput) {
    return;
  }

  const text = manMilestoneInput.value.trim();
  if (!text) {
    return;
  }

  data = {
    ...data,
    manMilestones: [...data.manMilestones, { id: createManMilestoneId(), text, done: false }]
  };

  manMilestoneInput.value = "";
  saveHabitsData(data);
  renderManMilestoneList();
}

function handleAnalyticsListClick(event: Event): void {
  const target = event.target as HTMLElement;
  const actionEl = target.closest<HTMLElement>("[data-action]");
  if (!actionEl) {
    return;
  }

  const action = actionEl.dataset.action;

  if (action === "remove-side-quest" && actionEl.dataset.sideQuestId) {
    const sideQuestId = actionEl.dataset.sideQuestId;
    data = {
      ...data,
      sideQuests: data.sideQuests.filter((item) => item.id !== sideQuestId)
    };
    saveHabitsData(data);
    renderSideQuestList();
    return;
  }

  if (action === "remove-man-milestone" && actionEl.dataset.manMilestoneId) {
    const milestoneId = actionEl.dataset.manMilestoneId;
    data = {
      ...data,
      manMilestones: data.manMilestones.filter((item) => item.id !== milestoneId)
    };
    saveHabitsData(data);
    renderManMilestoneList();
    return;
  }

  if (action === "toggle-man-milestone" && actionEl.dataset.manMilestoneId) {
    const milestoneId = actionEl.dataset.manMilestoneId;
    data = {
      ...data,
      manMilestones: data.manMilestones.map((item) =>
        item.id === milestoneId ? { ...item, done: !item.done } : item
      )
    };
    saveHabitsData(data);
    renderManMilestoneList();
  }
}

function handleCopyHabits(): void {
  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();
  const monthData = getMonthData(data, year, monthIndex);
  const sourceMonthLabel = makeMonthLabel(year, monthIndex);

  const clipboard: HabitsClipboard = {
    sourceMonthKey: formatMonthKey(year, monthIndex),
    sourceMonthLabel,
    copiedAt: new Date().toISOString(),
    habits: monthData.habits.map((habit) => ({ ...habit }))
  };

  localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(clipboard));
  updateClipboardUi(`Copied ${monthData.habits.length} quest definitions from ${sourceMonthLabel}`);
}

function handlePasteHabits(): void {
  const clipboard = parseClipboard();
  if (!clipboard) {
    updateClipboardUi("Nothing copied yet");
    return;
  }

  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();
  const destinationLabel = makeMonthLabel(year, monthIndex);
  const destinationData = getMonthData(data, year, monthIndex);
  const hasDestinationContent =
    destinationData.habits.length > 0 || Object.keys(destinationData.log).length > 0;

  if (!hasDestinationContent) {
    pasteClipboardIntoCurrentMonth("replace");
    return;
  }

  const replace = window.confirm(
    `Paste quests into ${destinationLabel}?\\n\\nOK = Replace this month's quest list (progress resets)\\nCancel = Merge quests without duplicates`
  );

  if (replace) {
    const confirmed = window.confirm(
      `This will overwrite existing quests in ${destinationLabel} and reset progress for this month. Continue?`
    );
    if (!confirmed) {
      updateClipboardUi("Paste cancelled");
      return;
    }

    pasteClipboardIntoCurrentMonth("replace");
    return;
  }

  pasteClipboardIntoCurrentMonth("merge");
}

function handleDeleteAllHabitsClick(): void {
  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();
  const monthData = getMonthData(data, year, monthIndex);
  if (monthData.habits.length === 0) {
    return;
  }

  if (deleteModalMonthLabel) {
    deleteModalMonthLabel.textContent = makeMonthLabel(year, monthIndex);
  }

  setDeleteMonthModalOpen(true);
}

function handleDeleteAllHabitsConfirm(): void {
  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();
  const monthLabelText = makeMonthLabel(year, monthIndex);

  data = clearMonthHabits(data, year, monthIndex);
  persistAndRender();
  updateClipboardUi(`Deleted all quests in ${monthLabelText}`);
  setDeleteMonthModalOpen(false);
}

habitGrid?.addEventListener("click", handleGridClick);

habitGrid?.addEventListener("contextmenu", (event: Event) => {
  const e = event as MouseEvent;
  const target = e.target as HTMLElement;
  const cellEl = target.closest<HTMLElement>(".habit-cell");

  if (!cellEl) return;

  e.preventDefault();

  if (cellEl.classList.contains("cell-locked")) return;

  const habitId = cellEl.dataset.habitId;
  const dateKey = cellEl.dataset.dateKey;
  if (!habitId || !dateKey) return;

  const year = currentView.getFullYear();
  const monthIndex = currentView.getMonth();
  const monthData = getMonthData(data, year, monthIndex);
  const currentState = getCellState(monthData, habitId, dateKey);
  const nextState = currentState === "cross" ? null : "cross" as const;
  data = setCellState(data, year, monthIndex, habitId, dateKey, nextState);
  updateCellDom(cellEl, nextState);
  if (nextState) playCellSound();
  persistOnly();
});

addHabitBtn?.addEventListener("click", handleAddHabit);
addSideQuestBtn?.addEventListener("click", handleAddSideQuest);
addManMilestoneBtn?.addEventListener("click", handleAddManMilestone);
sideQuestList?.addEventListener("click", handleAnalyticsListClick);
manMilestoneList?.addEventListener("click", handleAnalyticsListClick);
copyHabitsBtn?.addEventListener("click", handleCopyHabits);
pasteHabitsBtn?.addEventListener("click", handlePasteHabits);
deleteAllHabitsBtn?.addEventListener("click", handleDeleteAllHabitsClick);
cancelDeleteMonthBtn?.addEventListener("click", () => setDeleteMonthModalOpen(false));
confirmDeleteMonthBtn?.addEventListener("click", handleDeleteAllHabitsConfirm);
deleteMonthModal?.addEventListener("click", (event) => {
  if (event.target === deleteMonthModal) {
    setDeleteMonthModalOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setDeleteMonthModalOpen(false);
  }
});
newHabitInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleAddHabit();
  }
});
sideQuestInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleAddSideQuest();
  }
});
manMilestoneInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleAddManMilestone();
  }
});

prevMonthBtn?.addEventListener("click", () => {
  currentView = new Date(currentView.getFullYear(), currentView.getMonth() - 1, 1);
  render();
});

nextMonthBtn?.addEventListener("click", () => {
  currentView = new Date(currentView.getFullYear(), currentView.getMonth() + 1, 1);
  render();
});

updateClipboardUi();
toggleStatsFlipBtn?.addEventListener("click", () => setStatsFlipped(true));
toggleStatsBackBtn?.addEventListener("click", () => setStatsFlipped(false));
render();
