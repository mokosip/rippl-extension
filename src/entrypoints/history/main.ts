import { getSessionsInRange } from "@/db/queries";
import { isTrackingPaused, setTrackingPaused } from "@/privacy/privacy-controls";
import {
  computeWeeklySummary,
  DASHBOARD_LIVE,
  DASHBOARD_URL,
} from "@/summary/weekly-summary";
import { humanScaleComparison } from "@/summary/seeds";

const pausedBanner = document.getElementById("paused-banner")!;
const btnResume = document.getElementById("btn-resume")!;
const insightsHero = document.getElementById("insights-hero")!;
const heroNumber = document.getElementById("hero-number")!;
const heroSeed = document.getElementById("hero-seed")!;
const heroQualifier = document.getElementById("hero-qualifier")!;
const statCards = document.getElementById("stat-cards")!;
const bridgeEl = document.getElementById("bridge")!;
const bridgeText = document.getElementById("bridge-text")!;
const bridgeCta = document.getElementById("bridge-cta")! as HTMLAnchorElement;
const emptyState = document.getElementById("empty-state")!;
const dayList = document.getElementById("day-list")!;

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs}hr`;
  return `${hrs}hr ${mins}min`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return mins < 1 ? "<1 min" : `${mins} min`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateLabel(dateStr: string): string {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (dateStr === todayStr) return "Today";
  if (dateStr === yesterdayStr) return "Yesterday";

  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  const startDate = start.toISOString().slice(0, 10);
  return { startDate, endDate };
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function render(): Promise<void> {
  const paused = await isTrackingPaused();
  if (paused) {
    pausedBanner.classList.remove("hidden");
  }

  const { startDate, endDate } = getDateRange();
  const sessions = await getSessionsInRange(startDate, endDate);
  const summary = computeWeeklySummary(sessions, startDate, endDate);

  if (summary.totalSessions === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  insightsHero.classList.remove("hidden");

  const hasTimeSaved = summary.totalTimeSavedMinutes > 0;

  if (hasTimeSaved) {
    heroNumber.textContent = `${formatMinutes(summary.totalTimeSavedMinutes)} saved`;
    heroSeed.textContent = `"${humanScaleComparison(summary.totalTimeSavedMinutes)}"`;
    heroQualifier.textContent = `from ${summary.loggedSessions} of ${summary.totalSessions} sessions`;
  } else {
    heroNumber.textContent = `${formatMinutes(summary.totalActiveMinutes)} on AI tools`;
    heroSeed.classList.add("hidden");
    heroQualifier.textContent = `${summary.totalSessions} session${summary.totalSessions !== 1 ? "s" : ""} this week`;
  }

  // Stat cards
  const loggedRatio = summary.loggedSessions / summary.totalSessions;

  if (summary.mostUsedTool) {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `
      <div class="stat-card-label">Most used</div>
      <div class="stat-card-value">${escapeHtml(summary.mostUsedTool.name)}</div>
      <div class="stat-card-pct">(${summary.mostUsedTool.percentage}%)</div>
    `;
    statCards.appendChild(card);
  }

  if (loggedRatio >= 0.5) {
    const card = document.createElement("div");
    card.className = "stat-card";
    if (summary.topActivity) {
      card.innerHTML = `
        <div class="stat-card-label">Top activity</div>
        <div class="stat-card-value">${escapeHtml(summary.topActivity.name)}</div>
        <div class="stat-card-pct">(${summary.topActivity.percentage}%)</div>
      `;
    } else {
      card.innerHTML = `
        <div class="stat-card-label">Top activity</div>
        <div class="stat-card-value">&mdash;</div>
      `;
    }
    statCards.appendChild(card);
  } else {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `
      <div class="stat-card-label">Avg session</div>
      <div class="stat-card-value">${formatMinutes(summary.averageSessionMinutes)}</div>
    `;
    statCards.appendChild(card);
  }

  // Bridge
  if (hasTimeSaved) {
    bridgeEl.classList.remove("hidden");
    if (DASHBOARD_LIVE) {
      bridgeText.textContent = `You freed ${formatMinutes(summary.totalTimeSavedMinutes)} this week. What could that become?`;
      bridgeCta.textContent = "Explore on Dashboard →";
      bridgeCta.href = DASHBOARD_URL;
      bridgeCta.classList.remove("hidden");
    } else {
      bridgeText.textContent = `You freed ${formatMinutes(summary.totalTimeSavedMinutes)} this week.`;
    }
  }

  // Day-by-day list
  for (const day of summary.dailySummaries) {
    const dateLabel = formatDateLabel(day.date);
    const loggedInDay = day.sessions.filter(
      (s) => s.logged && s.timeSavedMinutes !== null && s.timeSavedMinutes > 0,
    );
    const dayHasTimeSaved = loggedInDay.length > 0 && day.totalTimeSavedMinutes > 0;

    const timeMetric = dayHasTimeSaved
      ? `${formatMinutes(day.totalTimeSavedMinutes)} saved`
      : `${formatMinutes(day.totalActiveMinutes)} on AI`;

    const count = day.sessions.length;

    const group = document.createElement("div");
    group.className = "day-group";

    const header = document.createElement("div");
    header.className = "day-header";

    const chevron = document.createElement("span");
    chevron.className = "day-chevron";
    chevron.textContent = "▸";

    const label = document.createElement("span");
    label.className = "day-label";
    label.textContent = dateLabel;

    const meta = document.createElement("span");
    meta.className = "day-meta";
    meta.textContent = `${timeMetric} (${count} session${count !== 1 ? "s" : ""})`;

    header.appendChild(chevron);
    header.appendChild(label);
    header.appendChild(meta);

    const sessionsEl = document.createElement("div");
    sessionsEl.className = "day-sessions hidden";

    const visibleSessions = day.sessions.filter(
      (s) => !s.logged || s.activityType !== null || s.timeSavedMinutes !== null,
    );

    for (const s of visibleSessions) {
      const row = document.createElement("div");
      row.className = "session-row";

      const domainEl = document.createElement("span");
      domainEl.className = "session-domain";
      domainEl.textContent = s.domain;

      const durationEl = document.createElement("span");
      durationEl.className = "session-duration";
      durationEl.textContent = formatDuration(s.activeSeconds);

      const savedEl = document.createElement("span");
      savedEl.className = "session-saved";
      if (s.timeSavedMinutes !== null && s.timeSavedMinutes > 0) {
        savedEl.textContent = `saved ${formatMinutes(s.timeSavedMinutes)}`;
      }

      const activityEl = document.createElement("span");
      if (!s.logged) {
        activityEl.className = "session-activity unlogged";
        activityEl.textContent = "Not logged";
      } else {
        activityEl.className = "session-activity";
        activityEl.textContent = s.activityType?.join(", ") ?? null;
      }

      const timeEl = document.createElement("span");
      timeEl.className = "session-time";
      timeEl.textContent = formatTime(s.startedAt);

      row.appendChild(domainEl);
      row.appendChild(durationEl);
      row.appendChild(savedEl);
      row.appendChild(activityEl);
      row.appendChild(timeEl);
      sessionsEl.appendChild(row);
    }

    header.addEventListener("click", () => {
      sessionsEl.classList.toggle("hidden");
      if (sessionsEl.classList.contains("hidden")) {
        chevron.textContent = "▸";
        chevron.classList.remove("expanded");
      } else {
        chevron.textContent = "▾";
        chevron.classList.add("expanded");
      }
    });

    group.appendChild(header);
    group.appendChild(sessionsEl);
    dayList.appendChild(group);
  }
}

btnResume.addEventListener("click", async () => {
  await setTrackingPaused(false);
  pausedBanner.classList.add("hidden");
});

render();
