import { db } from "@/db/index";
import {
  expirePendingFeedback as expireFeedbackQueue,
  getNextPendingFeedback,
  markFeedbackAnswered,
} from "@/feedback/feedback-queue";
import { submitSessionFeedback } from "@/sync/dashboard-sync";
import { computeTodaySummary, formatDuration } from "./view-model";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`[rippl] missing #${id}`);
  return element as T;
}

const stateLoading = byId<HTMLElement>("state-loading");
const stateFeedback = byId<HTMLElement>("state-feedback");
const stateStatus = byId<HTMLElement>("state-status");

const feedbackQuestion = byId<HTMLElement>("feedback-question");
const feedbackOptions = byId<HTMLElement>("feedback-options");
const feedbackError = byId<HTMLElement>("feedback-error");

const statusDate = byId<HTMLElement>("status-date");
const statusLine = byId<HTMLElement>("status-line");
const statusStats = byId<HTMLElement>("status-stats");
const statusSessionCount = byId<HTMLElement>("status-session-count");
const statusDuration = byId<HTMLElement>("status-duration");
const statusActive = byId<HTMLElement>("status-active");
const statusEmpty = byId<HTMLElement>("status-empty");
const btnTogglePause = byId<HTMLButtonElement>("btn-toggle-pause");

const btnHistory = byId<HTMLButtonElement>("btn-history");
const btnSettings = byId<HTMLButtonElement>("btn-settings");

function showState(target: HTMLElement): void {
  stateLoading.classList.add("hidden");
  stateFeedback.classList.add("hidden");
  stateStatus.classList.add("hidden");
  target.classList.remove("hidden");
}

function setFeedbackError(message: string | null): void {
  if (!message) {
    feedbackError.textContent = "";
    feedbackError.classList.add("hidden");
    return;
  }

  feedbackError.textContent = message;
  feedbackError.classList.remove("hidden");
}

function setFeedbackButtonsDisabled(disabled: boolean): void {
  feedbackOptions
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach(button => {
      button.disabled = disabled;
    });
}

function renderFeedbackOptions(
  options: Array<{ label: string; value: string }>,
  onSelect: (value: string) => Promise<void>,
): void {
  feedbackOptions.innerHTML = "";

  options.forEach(option => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feedback-option";
    button.textContent = option.label;
    button.addEventListener("click", () => {
      onSelect(option.value);
    });

    feedbackOptions.appendChild(button);
  });
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

async function getTrackingPaused(): Promise<boolean> {
  const entry = await db.config.get("trackingPaused");
  return entry?.value === true;
}

async function setTrackingPaused(paused: boolean): Promise<void> {
  await db.config.put({ key: "trackingPaused", value: paused });
}

function renderPauseButton(paused: boolean): void {
  btnTogglePause.textContent = paused ? "Resume" : "Pause";
  btnTogglePause.setAttribute(
    "aria-label",
    paused ? "Resume tracking" : "Pause tracking",
  );
}

async function renderStatus(): Promise<void> {
  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10);

  const [sessions, paused] = await Promise.all([
    db.activitySessions.toArray(),
    getTrackingPaused(),
  ]);

  const summary = computeTodaySummary(sessions, todayDate);

  statusDate.textContent = formatDateLabel(now);
  renderPauseButton(paused);

  if (summary.sessionCount === 0) {
    statusLine.classList.add("hidden");
    statusStats.classList.add("hidden");
    statusEmpty.classList.remove("hidden");
  } else {
    const sessionLabel = `${summary.sessionCount} session${summary.sessionCount === 1 ? "" : "s"}`;

    statusLine.textContent = `${sessionLabel} · ${formatDuration(summary.totalActiveMs)} active`;
    statusSessionCount.textContent = String(summary.sessionCount);
    statusDuration.textContent = formatDuration(summary.totalDurationMs);
    statusActive.textContent = formatDuration(summary.totalActiveMs);

    statusLine.classList.remove("hidden");
    statusStats.classList.remove("hidden");
    statusEmpty.classList.add("hidden");
  }

  showState(stateStatus);
}

async function renderFeedbackOrStatus(): Promise<void> {
  await expireFeedbackQueue();
  const pending = await getNextPendingFeedback();

  if (!pending) {
    await renderStatus();
    return;
  }

  feedbackQuestion.textContent = pending.question;
  setFeedbackError(null);

  renderFeedbackOptions(pending.options, async value => {
    setFeedbackError(null);
    setFeedbackButtonsDisabled(true);

    const submitted = await submitSessionFeedback(pending.sessionId, value, "task_type");
    if (!submitted) {
      setFeedbackError("Could not submit feedback. Please try again.");
      setFeedbackButtonsDisabled(false);
      return;
    }

    await markFeedbackAnswered(pending.id);
    await renderStatus();
  });

  showState(stateFeedback);
}

btnTogglePause.addEventListener("click", async () => {
  btnTogglePause.disabled = true;

  try {
    const paused = await getTrackingPaused();
    await setTrackingPaused(!paused);
    await renderStatus();
  } finally {
    btnTogglePause.disabled = false;
  }
});

btnHistory.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("/history.html") });
  window.close();
});

btnSettings.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("/welcome.html") });
  window.close();
});

async function init(): Promise<void> {
  try {
    await renderFeedbackOrStatus();
  } catch (error) {
    console.error("[rippl] popup init failed", error);
    const loadingText = stateLoading.querySelector(".loading-text");
    if (loadingText) {
      loadingText.textContent = "Something went wrong. Try reopening popup.";
    } else {
      stateLoading.textContent = "Something went wrong. Try reopening popup.";
    }
    showState(stateLoading);
  }
}

init();
