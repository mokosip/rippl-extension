import { db, type Session } from "./index";

export async function saveSession(session: Session): Promise<void> {
  await db.sessions.put(session);
}

export async function getSessionsByDate(date: string): Promise<Session[]> {
  return db.sessions.where("date").equals(date).toArray();
}

export async function getSessionsInRange(startDate: string, endDate: string): Promise<Session[]> {
  return db.sessions.where("date").between(startDate, endDate, true, true).toArray();
}

export async function getUnloggedSessions(): Promise<Session[]> {
  const now = Date.now();
  return db.sessions
    .where("logged").equals(0)
    .filter(s => s.badgeExpiry !== null && s.badgeExpiry > now)
    .toArray();
}

export async function logSession(
  id: string,
  activityType: string,
  estimatedWithoutMinutes: number
): Promise<void> {
  const session = await db.sessions.get(id);
  if (!session) return;
  const activeMinutes = session.activeSeconds / 60;
  const timeSaved = Math.max(0, estimatedWithoutMinutes - activeMinutes);
  await db.sessions.update(id, {
    activityType,
    estimatedWithoutMinutes,
    timeSavedMinutes: Math.round(timeSaved),
    logged: true,
  });
}

export async function skipSession(id: string): Promise<void> {
  await db.sessions.update(id, { logged: true });
}

export async function skipAllUnlogged(): Promise<void> {
  const unlogged = await getUnloggedSessions();
  await db.sessions.bulkUpdate(
    unlogged.map(s => ({ key: s.id, changes: { logged: true } }))
  );
}

export async function deleteAllData(): Promise<void> {
  await db.sessions.clear();
  await db.config.clear();
  await db.customDomains.clear();
}

export async function pruneOldSessions(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  await db.sessions.where("date").below(cutoffStr).delete();
}
