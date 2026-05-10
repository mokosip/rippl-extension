import type { ActivitySession } from "../db/index";

export const DASHBOARD_LIVE = true;
export const DASHBOARD_URL = "https://me.ripplup.app";

export interface WeeklySummary {
  startDate: string;
  endDate: string;
  totalSessions: number;
  totalDurationMs: number;
  totalActiveMs: number;
  mostUsedTool: { name: string; percentage: number } | null;
  averageSessionMs: number;
  dailySummaries: DayEntry[];
}

export interface DayEntry {
  date: string;
  totalDurationMs: number;
  totalActiveMs: number;
  sessions: ActivitySession[];
}

export function computeWeeklySummary(
  sessions: ActivitySession[],
  startDate: string,
  endDate: string,
): WeeklySummary {
  if (sessions.length === 0) {
    return {
      startDate,
      endDate,
      totalSessions: 0,
      totalDurationMs: 0,
      totalActiveMs: 0,
      mostUsedTool: null,
      averageSessionMs: 0,
      dailySummaries: [],
    };
  }

  const totalSessions = sessions.length;
  const totalDurationMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
  const totalActiveMs = sessions.reduce(
    (sum, s) => sum + (typeof s.activeMs === "number" ? s.activeMs : s.durationMs),
    0,
  );
  const averageSessionMs = Math.round(totalDurationMs / totalSessions);

  // Most-used tool by total duration
  const domainMs = new Map<string, number>();
  for (const s of sessions) {
    domainMs.set(s.domain, (domainMs.get(s.domain) ?? 0) + s.durationMs);
  }

  let mostUsedTool: { name: string; percentage: number } | null = null;
  if (totalDurationMs > 0) {
    let maxDomain = "";
    let maxMs = 0;
    for (const [domain, ms] of domainMs) {
      if (ms > maxMs) {
        maxDomain = domain;
        maxMs = ms;
      }
    }
    mostUsedTool = {
      name: maxDomain,
      percentage: Math.round((maxMs / totalDurationMs) * 100),
    };
  }

  // Group by date (UTC)
  const dateMap = new Map<string, ActivitySession[]>();
  for (const s of sessions) {
    const date = new Date(s.startedAt).toISOString().slice(0, 10);
    if (!dateMap.has(date)) dateMap.set(date, []);
    dateMap.get(date)!.push(s);
  }

  const dailySummaries: DayEntry[] = [];
  for (const [date, daySessions] of dateMap) {
    const dayDurationMs = daySessions.reduce((sum, s) => sum + s.durationMs, 0);
    const dayActiveMs = daySessions.reduce(
      (sum, s) => sum + (typeof s.activeMs === "number" ? s.activeMs : s.durationMs),
      0,
    );
    dailySummaries.push({
      date,
      totalDurationMs: dayDurationMs,
      totalActiveMs: dayActiveMs,
      sessions: daySessions.sort((a, b) => a.startedAt - b.startedAt),
    });
  }

  dailySummaries.sort((a, b) => b.date.localeCompare(a.date));

  return {
    startDate,
    endDate,
    totalSessions,
    totalDurationMs,
    totalActiveMs,
    mostUsedTool,
    averageSessionMs,
    dailySummaries,
  };
}
