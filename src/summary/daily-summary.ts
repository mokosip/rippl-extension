import { getSessionsByDate } from "../db/queries";

export interface DailySummary {
  date: string;
  sessionCount: number;
  totalActiveMinutes: number;
  timeSavedMinutes: number;
  loggedCount: number;
  domainsUsed: string[];
}

export async function computeDailySummary(date: string): Promise<DailySummary> {
  const sessions = await getSessionsByDate(date);

  if (sessions.length === 0) {
    return { date, sessionCount: 0, totalActiveMinutes: 0, timeSavedMinutes: 0, loggedCount: 0, domainsUsed: [] };
  }

  const totalSeconds = sessions.reduce((sum, s) => sum + s.activeSeconds, 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  const logged = sessions.filter(s => s.logged && s.timeSavedMinutes !== null);
  const timeSaved = logged.reduce((sum, s) => sum + (s.timeSavedMinutes ?? 0), 0);
  const loggedCount = sessions.filter(s => s.logged).length;
  const domains = [...new Set(sessions.map(s => s.domain))];

  return {
    date,
    sessionCount: sessions.length,
    totalActiveMinutes: totalMinutes,
    timeSavedMinutes: timeSaved,
    loggedCount,
    domainsUsed: domains,
  };
}
