import { getActivitySessionsInRange } from "@/db/queries";
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

function formatMs(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${hrs}hr`;
  return `${hrs}hr ${rem}min`;
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
  const sessions = await getActivitySessionsInRange(startDate, endDate);
  const summary = computeWeeklySummary(sessions, startDate, endDate);

  if (summary.totalSessions === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  insightsHero.classList.remove("hidden");

  const activeMinutes = Math.round(summary.totalActiveMs / 60_000);
  heroNumber.textContent = `${formatMs(summary.totalActiveMs)} on AI tools`;
  heroSeed.textContent = activeMinutes >= 15
    ? `"${humanScaleComparison(activeMinutes)}"`
    : "";
  if (!heroSeed.textContent) heroSeed.classList.add("hidden");
  heroQualifier.textContent = `${summary.totalSessions} session${summary.totalSessions !== 1 ? "s" : ""} this week`;

  // Stat cards
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

  {
    const avgMs = summary.averageSessionMs;
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `
      <div class="stat-card-label">Avg session</div>
      <div class="stat-card-value">${formatMs(avgMs)}</div>
    `;
    statCards.appendChild(card);
  }

  // Bridge — always shown when sessions exist and dashboard is live
  if (DASHBOARD_LIVE) {
    bridgeEl.classList.remove("hidden");
    bridgeText.textContent = `You spent ${formatMs(summary.totalActiveMs)} on AI tools this week.`;
    bridgeCta.textContent = "Explore on Dashboard →";
    bridgeCta.href = DASHBOARD_URL;
    bridgeCta.classList.remove("hidden");
  }

  // Day-by-day list
  for (const day of summary.dailySummaries) {
    const dateLabel = formatDateLabel(day.date);
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
    meta.textContent = `${formatMs(day.totalActiveMs)} active (${count} session${count !== 1 ? "s" : ""})`;

    header.appendChild(chevron);
    header.appendChild(label);
    header.appendChild(meta);

    const sessionsEl = document.createElement("div");
    sessionsEl.className = "day-sessions hidden";

    for (const s of day.sessions) {
      const row = document.createElement("div");
      row.className = "session-row";

      const domainEl = document.createElement("span");
      domainEl.className = "session-domain";
      domainEl.textContent = s.domain;

      const durationEl = document.createElement("span");
      durationEl.className = "session-duration";
      durationEl.textContent = formatMs(s.durationMs);

      const activeEl = document.createElement("span");
      activeEl.className = "session-active";
      const activeMs = typeof s.activeMs === "number" ? s.activeMs : s.durationMs;
      activeEl.textContent = `${formatMs(activeMs)} active`;

      const timeEl = document.createElement("span");
      timeEl.className = "session-time";
      timeEl.textContent = formatTime(s.startedAt);

      row.appendChild(domainEl);
      row.appendChild(durationEl);
      row.appendChild(activeEl);
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
