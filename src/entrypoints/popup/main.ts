import { db, type Session } from "@/db/index";
import { logSession, skipSession, skipAllUnlogged, getSessionsInRange } from "@/db/queries";
import { updateBadge } from "@/badge/badge-manager";
import { isTrackingPaused, setTrackingPaused } from "@/privacy/privacy-controls";
import { computeDailySummary } from "@/summary/daily-summary";
import { humanScaleComparison } from "@/summary/seeds";
import { computeWeeklySummary } from "@/summary/weekly-summary";

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const stateLoading = document.getElementById("state-loading")!;
const statePrompt = document.getElementById("state-prompt")!;
const stateSessionList = document.getElementById("state-session-list")!;
const stateSummary = document.getElementById("state-summary")!;

const promptHeadline = document.getElementById("prompt-headline")!;
const activityPills = document.getElementById("activity-pills")!;
const timePills = document.getElementById("time-pills")!;
const btnSkip = document.getElementById("btn-skip")!;

const listHeadline = document.getElementById("list-headline")!;
const sessionListEl = document.getElementById("session-list")!;
const btnMerge = document.getElementById("btn-merge") as HTMLButtonElement;
const btnLogEach = document.getElementById("btn-log-each")!;
const btnSkipAll = document.getElementById("btn-skip-all")!;

// History + teaser refs
const btnHistory = document.getElementById("btn-history")!;
const weeklyTeaser = document.getElementById("weekly-teaser")!;

// Summary refs
const summaryDate = document.getElementById("summary-date")!;
const heroEl = document.getElementById("hero")!;
const seedEl = document.getElementById("seed")!;
const statsEl = document.getElementById("stats")!;
const pausedStateEl = document.getElementById("paused-state")!;
const emptyStateEl = document.getElementById("empty-state")!;
const btnPause = document.getElementById("btn-pause")!;
const btnResume = document.getElementById("btn-resume")!;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let selectedActivity: string | null = null;
let selectedTime: string | null = null;
let currentSession: {
  id: string;
  activeSeconds: number;
  domain: string;
} | null = null;
let sessionQueue: Session[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function domainLabel(domain: string): string {
  return domain;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return mins < 1 ? "<1 min" : `${mins} min`;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function showState(el: HTMLElement): void {
  stateLoading.classList.add("hidden");
  statePrompt.classList.add("hidden");
  stateSessionList.classList.add("hidden");
  stateSummary.classList.add("hidden");
  el.classList.remove("hidden");
}

async function refreshBadge(): Promise<void> {
  const paused = await isTrackingPaused();
  await updateBadge(paused);
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs}hr`;
  return `${hrs}hr ${mins}min`;
}

// ---------------------------------------------------------------------------
// Daily summary rendering
// ---------------------------------------------------------------------------
async function renderSummary(): Promise<void> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const summary = await computeDailySummary(todayStr);
  const paused = await isTrackingPaused();

  // Reset visibility of sub-sections
  heroEl.classList.remove("hidden");
  seedEl.classList.remove("hidden");
  statsEl.classList.remove("hidden");
  pausedStateEl.classList.add("hidden");
  emptyStateEl.classList.add("hidden");
  document.querySelector(".divider")?.classList.remove("hidden");

  // Date line
  const today = new Date();
  const isToday =
    todayStr === today.toISOString().slice(0, 10);
  summaryDate.textContent = isToday ? "Today" : todayStr;

  if (paused) {
    heroEl.classList.add("hidden");
    seedEl.classList.add("hidden");
    statsEl.classList.add("hidden");
    document.querySelector(".divider")?.classList.add("hidden");
    pausedStateEl.classList.remove("hidden");
    showState(stateSummary);
    return;
  }

  if (summary.sessionCount === 0) {
    heroEl.classList.add("hidden");
    seedEl.classList.add("hidden");
    statsEl.classList.add("hidden");
    document.querySelector(".divider")?.classList.add("hidden");
    emptyStateEl.classList.remove("hidden");
    showState(stateSummary);
    return;
  }

  // Determine hero based on logged ratio
  const loggedRatio =
    summary.sessionCount > 0
      ? summary.loggedCount / summary.sessionCount
      : 0;

  if (loggedRatio >= 0.5) {
    // Hero = time saved + human-scale seed
    heroEl.textContent = `${formatMinutes(summary.timeSavedMinutes)} saved`;
    seedEl.textContent = `“${humanScaleComparison(summary.timeSavedMinutes)}”`;
  } else {
    // Hero = total AI time, no seed
    heroEl.textContent = `${formatMinutes(summary.totalActiveMinutes)} on AI tools`;
    seedEl.classList.add("hidden");
  }

  // Stats below divider
  statsEl.innerHTML = `${formatMinutes(summary.totalActiveMinutes)} on AI tools<br>${summary.sessionCount} session${summary.sessionCount !== 1 ? "s" : ""} (${summary.loggedCount} logged)`;

  // Weekly teaser
  const now2 = new Date();
  const weekEnd = now2.toISOString().slice(0, 10);
  const weekStart = new Date(now2);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekSessions = await getSessionsInRange(weekStartStr, weekEnd);
  const weekSummary = computeWeeklySummary(weekSessions, weekStartStr, weekEnd);

  if (weekSummary.totalSessions > 0) {
    weeklyTeaser.classList.remove("hidden");
    if (weekSummary.totalTimeSavedMinutes > 0) {
      weeklyTeaser.textContent = `This week: ${formatMinutes(weekSummary.totalTimeSavedMinutes)} saved →`;
    } else {
      weeklyTeaser.textContent = `This week: ${formatMinutes(weekSummary.totalActiveMinutes)} on AI tools →`;
    }
  }

  showState(stateSummary);
}

// Wire settings
const btnSettings = document.getElementById("btn-settings")!;
btnSettings.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("/welcome.html") });
  window.close();
});

btnHistory.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("/history.html") });
  window.close();
});

weeklyTeaser.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("/history.html") });
  window.close();
});

// Wire pause / resume
btnPause.addEventListener("click", async () => {
  await setTrackingPaused(true);
  await refreshBadge();
  await renderSummary();
});

btnResume.addEventListener("click", async () => {
  await setTrackingPaused(false);
  await refreshBadge();
  await renderSummary();
});

// ---------------------------------------------------------------------------
// Micro-prompt logic
// ---------------------------------------------------------------------------
function showPrompt(session: {
  id: string;
  activeSeconds: number;
  domain: string;
  startedAt: number;
}): void {
  currentSession = session;
  selectedActivity = null;
  selectedTime = null;

  const mins = Math.round(session.activeSeconds / 60);
  const label = domainLabel(session.domain);
  const time = formatTime(session.startedAt);
  promptHeadline.textContent = `${formatDuration(session.activeSeconds)} on ${label} at ${time}`;

  // Reset pill selections
  activityPills
    .querySelectorAll(".pill")
    .forEach((p) => p.classList.remove("selected"));
  timePills
    .querySelectorAll(".pill")
    .forEach((p) => p.classList.remove("selected"));

  // Update the "~same" data-value to actual active minutes
  const samePill = timePills.querySelector(
    '.pill[data-value="same"]'
  ) as HTMLElement | null;
  if (samePill) {
    samePill.dataset.resolved = String(mins);
  }

  showState(statePrompt);
}

async function tryLog(): Promise<void> {
  if (!selectedActivity || !selectedTime || !currentSession) return;

  const estimatedWithoutMinutes =
    selectedTime === "same"
      ? Math.round(currentSession.activeSeconds / 60)
      : parseInt(selectedTime, 10);

  await logSession(currentSession.id, selectedActivity, estimatedWithoutMinutes);
  await refreshBadge();

  // If there are more sessions queued, show the next one
  if (sessionQueue.length > 0) {
    const next = sessionQueue.shift()!;
    showPrompt({
      id: next.id,
      activeSeconds: next.activeSeconds,
      domain: next.domain,
      startedAt: next.startedAt,
    });
  } else {
    await renderSummary();
  }
}

// ---------------------------------------------------------------------------
// Pill click handlers
// ---------------------------------------------------------------------------
activityPills.addEventListener("click", (e) => {
  const pill = (e.target as HTMLElement).closest(".pill") as HTMLElement | null;
  if (!pill) return;
  activityPills
    .querySelectorAll(".pill")
    .forEach((p) => p.classList.remove("selected"));
  pill.classList.add("selected");
  selectedActivity = pill.dataset.value ?? null;
  tryLog();
});

timePills.addEventListener("click", (e) => {
  const pill = (e.target as HTMLElement).closest(".pill") as HTMLElement | null;
  if (!pill) return;
  timePills
    .querySelectorAll(".pill")
    .forEach((p) => p.classList.remove("selected"));
  pill.classList.add("selected");
  const val = pill.dataset.value ?? "";
  selectedTime = val;
  tryLog();
});

// Skip button
btnSkip.addEventListener("click", async () => {
  if (!currentSession) return;
  await skipSession(currentSession.id);
  await refreshBadge();

  if (sessionQueue.length > 0) {
    const next = sessionQueue.shift()!;
    showPrompt({
      id: next.id,
      activeSeconds: next.activeSeconds,
      domain: next.domain,
      startedAt: next.startedAt,
    });
  } else {
    await renderSummary();
  }
});

// ---------------------------------------------------------------------------
// Multi-session list logic
// ---------------------------------------------------------------------------
function renderSessionList(sessions: Session[]): void {
  listHeadline.textContent = `${sessions.length} sessions to log`;
  sessionListEl.innerHTML = "";

  sessions.forEach((session) => {
    const row = document.createElement("div");
    row.className = "session-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.sessionId = session.id;
    cb.addEventListener("change", updateMergeButton);

    const label = document.createElement("span");
    label.className = "session-label";
    label.textContent = domainLabel(session.domain);

    const duration = document.createElement("span");
    duration.className = "session-duration";
    duration.textContent = formatDuration(session.activeSeconds);

    const time = document.createElement("span");
    time.className = "session-time";
    time.textContent = formatTime(session.startedAt);

    row.appendChild(cb);
    row.appendChild(label);
    row.appendChild(duration);
    row.appendChild(time);
    sessionListEl.appendChild(row);
  });

  showState(stateSessionList);
}

function updateMergeButton(): void {
  const checked = sessionListEl.querySelectorAll(
    'input[type="checkbox"]:checked'
  );
  btnMerge.disabled = checked.length < 2;
}

// Merge selected
btnMerge.addEventListener("click", async () => {
  const checked = sessionListEl.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]:checked'
  );
  if (checked.length < 2) return;

  const selectedIds = new Set(
    Array.from(checked).map((cb) => cb.dataset.sessionId!)
  );

  // Get unlogged sessions fresh from DB
  const now = Date.now();
  const allUnlogged = await db.sessions
    .filter((s) => !s.logged && s.badgeExpiry !== null && s.badgeExpiry! > now)
    .toArray();

  const selectedSessions = allUnlogged.filter((s) => selectedIds.has(s.id));
  const unselectedSessions = allUnlogged.filter((s) => !selectedIds.has(s.id));

  if (selectedSessions.length < 2) return;

  // Merge: longest-duration domain wins, durations summed
  const longestSession = selectedSessions.reduce((a, b) =>
    a.activeSeconds >= b.activeSeconds ? a : b
  );
  const totalSeconds = selectedSessions.reduce(
    (sum, s) => sum + s.activeSeconds,
    0
  );

  // Skip all but one — we'll log the "winner" with merged data
  // Actually, we need to skip all selected sessions, then show prompt for merged result
  // The prompt will log the longest-duration session with the total time
  const otherIds = selectedSessions
    .filter((s) => s.id !== longestSession.id)
    .map((s) => s.id);
  for (const id of otherIds) {
    await skipSession(id);
  }

  // Queue unselected sessions for later
  sessionQueue = unselectedSessions;

  showPrompt({
    id: longestSession.id,
    activeSeconds: totalSeconds,
    domain: longestSession.domain,
    startedAt: longestSession.startedAt,
  });
});

// Log each
btnLogEach.addEventListener("click", async () => {
  const now = Date.now();
  const unlogged = await db.sessions
    .filter((s) => !s.logged && s.badgeExpiry !== null && s.badgeExpiry! > now)
    .toArray();

  if (unlogged.length === 0) {
    await renderSummary();
    return;
  }

  // Sort by startedAt ascending
  unlogged.sort((a, b) => a.startedAt - b.startedAt);

  const first = unlogged.shift()!;
  sessionQueue = unlogged;

  showPrompt({
    id: first.id,
    activeSeconds: first.activeSeconds,
    domain: first.domain,
    startedAt: first.startedAt,
  });
});

// Skip all
btnSkipAll.addEventListener("click", async () => {
  await skipAllUnlogged();
  await refreshBadge();
  await renderSummary();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init(): Promise<void> {
  try {
    const now = Date.now();
    const unlogged = await db.sessions
      .filter((s) => !s.logged && s.badgeExpiry !== null && s.badgeExpiry! > now)
      .toArray();

    unlogged.sort((a, b) => a.startedAt - b.startedAt);

    if (unlogged.length === 0) {
      await renderSummary();
    } else if (unlogged.length === 1) {
      const s = unlogged[0];
      showPrompt({
        id: s.id,
        activeSeconds: s.activeSeconds,
        domain: s.domain,
        startedAt: s.startedAt,
      });
    } else {
      renderSessionList(unlogged);
    }
  } catch (e) {
    console.error("[rippl] popup init failed", e);
    stateLoading.textContent = "Something went wrong. Try reopening the popup.";
  }
}

init();
