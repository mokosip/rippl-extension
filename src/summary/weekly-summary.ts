import type { Session } from "../db/index";

export const DASHBOARD_LIVE = false;
export const DASHBOARD_URL = "https://ripplup.app";

export interface WeeklySummary {
  startDate: string;
  endDate: string;
  totalSessions: number;
  loggedSessions: number;
  totalActiveMinutes: number;
  totalTimeSavedMinutes: number;
  mostUsedTool: { name: string; percentage: number } | null;
  topActivity: { name: string; percentage: number } | null;
  averageSessionMinutes: number;
  dailySummaries: DayEntry[];
}

export interface DayEntry {
  date: string;
  totalTimeSavedMinutes: number;
  totalActiveMinutes: number;
  sessions: Session[];
}

export function computeWeeklySummary(
  sessions: Session[],
  startDate: string,
  endDate: string,
): WeeklySummary {
  if (sessions.length === 0) {
    return {
      startDate,
      endDate,
      totalSessions: 0,
      loggedSessions: 0,
      totalActiveMinutes: 0,
      totalTimeSavedMinutes: 0,
      mostUsedTool: null,
      topActivity: null,
      averageSessionMinutes: 0,
      dailySummaries: [],
    };
  }

  const totalSessions = sessions.length;
  const loggedSessions = sessions.filter((s) => s.logged).length;
  const totalSeconds = sessions.reduce((sum, s) => sum + s.activeSeconds, 0);
  const totalActiveMinutes = Math.round(totalSeconds / 60);
  const totalTimeSavedMinutes = sessions
    .filter((s) => s.logged && s.timeSavedMinutes !== null)
    .reduce((sum, s) => sum + (s.timeSavedMinutes ?? 0), 0);

  const domainSeconds = new Map<string, number>();
  for (const s of sessions) {
    domainSeconds.set(
      s.domain,
      (domainSeconds.get(s.domain) ?? 0) + s.activeSeconds,
    );
  }

  let mostUsedTool: { name: string; percentage: number } | null = null;
  if (totalSeconds > 0) {
    let maxDomain = "";
    let maxSeconds = 0;
    for (const [domain, seconds] of domainSeconds) {
      if (seconds > maxSeconds) {
        maxDomain = domain;
        maxSeconds = seconds;
      }
    }
    mostUsedTool = {
      name: maxDomain,
      percentage: Math.round((maxSeconds / totalSeconds) * 100),
    };
  }

  const loggedRatio = loggedSessions / totalSessions;
  let topActivity: { name: string; percentage: number } | null = null;
  const averageSessionMinutes = Math.round(totalActiveMinutes / totalSessions);

  if (loggedRatio >= 0.5) {
    const loggedWithActivity = sessions.filter(
      (s) => s.logged && s.activityType !== null,
    );
    if (loggedWithActivity.length > 0) {
      const activityCounts = new Map<string, number>();
      for (const s of loggedWithActivity) {
        activityCounts.set(
          s.activityType!,
          (activityCounts.get(s.activityType!) ?? 0) + 1,
        );
      }
      let maxActivity = "";
      let maxCount = 0;
      for (const [activity, count] of activityCounts) {
        if (count > maxCount) {
          maxActivity = activity;
          maxCount = count;
        }
      }
      topActivity = {
        name: maxActivity,
        percentage: Math.round((maxCount / loggedWithActivity.length) * 100),
      };
    }
  }

  const dateMap = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!dateMap.has(s.date)) dateMap.set(s.date, []);
    dateMap.get(s.date)!.push(s);
  }

  const dailySummaries: DayEntry[] = [];
  for (const [date, daySessions] of dateMap) {
    const daySeconds = daySessions.reduce((sum, s) => sum + s.activeSeconds, 0);
    const dayTimeSaved = daySessions
      .filter((s) => s.logged && s.timeSavedMinutes !== null)
      .reduce((sum, s) => sum + (s.timeSavedMinutes ?? 0), 0);
    dailySummaries.push({
      date,
      totalActiveMinutes: Math.round(daySeconds / 60),
      totalTimeSavedMinutes: dayTimeSaved,
      sessions: daySessions.sort((a, b) => a.startedAt - b.startedAt),
    });
  }

  dailySummaries.sort((a, b) => b.date.localeCompare(a.date));

  return {
    startDate,
    endDate,
    totalSessions,
    loggedSessions,
    totalActiveMinutes,
    totalTimeSavedMinutes,
    mostUsedTool,
    topActivity,
    averageSessionMinutes,
    dailySummaries,
  };
}
