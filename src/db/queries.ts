import { db, type ActivitySession } from "./index";

export async function getActivitySessionsInRange(
  startDate: string,
  endDate: string,
): Promise<ActivitySession[]> {
  const startMs = new Date(startDate + "T00:00:00Z").getTime();
  const endMs = new Date(endDate + "T23:59:59.999Z").getTime();
  return db.activitySessions
    .where("startedAt")
    .between(startMs, endMs, true, true)
    .toArray();
}

export async function pruneOldSessions(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffMs = cutoff.getTime();
  await db.activitySessions.where("startedAt").below(cutoffMs).delete();
}
