import { db } from "../db/index";

export interface DailySummary {
  date: string;
  sessionCount: number;
  totalDurationMs: number;
  totalActiveMs: number;
  domainsUsed: string[];
}

export async function computeDailySummary(date: string): Promise<DailySummary> {
  const all = await db.activitySessions.toArray();
  const sessions = all.filter(
    s => new Date(s.startedAt).toISOString().slice(0, 10) === date,
  );

  if (sessions.length === 0) {
    return { date, sessionCount: 0, totalDurationMs: 0, totalActiveMs: 0, domainsUsed: [] };
  }

  const totalDurationMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
  const totalActiveMs = sessions.reduce(
    (sum, s) => sum + (typeof s.activeMs === "number" ? s.activeMs : s.durationMs),
    0,
  );
  const domainsUsed = [...new Set(sessions.map(s => s.domain))];

  return { date, sessionCount: sessions.length, totalDurationMs, totalActiveMs, domainsUsed };
}
