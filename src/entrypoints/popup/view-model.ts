import type { ActivitySession } from "@/db/index";

export function formatDuration(ms: number): string {
  if (ms < 60_000) return "< 1 min";

  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}hr ${minutes}min`;
}

export interface TodaySummary {
  sessionCount: number;
  totalDurationMs: number;
  totalActiveMs: number;
}

export function computeTodaySummary(
  sessions: ActivitySession[],
  todayDate: string,
): TodaySummary {
  const todaySessions = sessions.filter(
    session => new Date(session.startedAt).toISOString().slice(0, 10) === todayDate,
  );

  return todaySessions.reduce<TodaySummary>(
    (summary, session) => ({
      sessionCount: summary.sessionCount + 1,
      totalDurationMs: summary.totalDurationMs + session.durationMs,
      totalActiveMs:
        summary.totalActiveMs +
        (typeof session.activeMs === "number" ? session.activeMs : session.durationMs),
    }),
    {
      sessionCount: 0,
      totalDurationMs: 0,
      totalActiveMs: 0,
    },
  );
}
