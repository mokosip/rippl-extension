import { db, type Session } from "@/db/index";

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? "https://me.ripplup.app";
const SYNC_ALARM = "rippl-dashboard-sync";
const SYNC_INTERVAL_MINUTES = 60;

export async function getAuthToken(): Promise<string | null> {
  const config = await db.config.get("dashboardToken");
  return (config?.value as string) ?? null;
}

export async function setAuthToken(token: string): Promise<void> {
  await db.config.put({ key: "dashboardToken", value: token });
  await db.sessions.where("syncStatus").equals("local").modify({ syncStatus: "pending" });
  console.log("[rippl-sync] token stored, marked local sessions as pending");
}

export async function clearAuthToken(): Promise<void> {
  await db.config.delete("dashboardToken");
  console.log("[rippl-sync] token cleared");
}

async function getPendingSessions(): Promise<Session[]> {
  const pending = await db.sessions.where("syncStatus").equals("pending").toArray();
  return pending.filter(s => s.logged);
}

export async function syncSessions(): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;

  const pending = await getPendingSessions();
  if (pending.length === 0) return;

  console.log("[rippl-sync] syncing", pending.length, "sessions");

  const payload = pending.map(s => ({
    id: s.id,
    domain: s.domain,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    activeSeconds: s.activeSeconds,
    date: s.date,
    activityType: s.activityType,
    estimatedWithoutMinutes: s.estimatedWithoutMinutes,
    timeSavedMinutes: s.timeSavedMinutes,
    logged: s.logged,
  }));

  try {
    const res = await fetch(`${DASHBOARD_URL}/api/sync/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ sessions: payload }),
    });

    if (res.status === 401) {
      console.warn("[rippl-sync] 401 — token invalid, clearing");
      await clearAuthToken();
      return;
    }

    if (!res.ok) {
      console.error("[rippl-sync] sync failed", res.status);
      return;
    }

    const result = await res.json();
    console.log("[rippl-sync] synced:", result.accepted, "accepted,", result.duplicates, "dupes");

    const ids = pending.map(s => s.id);
    await db.sessions.where("id").anyOf(ids).modify({ syncStatus: "synced" });
  } catch (e) {
    console.error("[rippl-sync] network error", e);
  }
}

export function setupPeriodicSync(): void {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
}

export function handleSyncAlarm(alarmName: string): boolean {
  if (alarmName !== SYNC_ALARM) return false;
  syncSessions();
  return true;
}
