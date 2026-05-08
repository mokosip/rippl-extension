import { db, type ActivitySession } from "../db/index";
import { queueFeedback } from "../feedback/feedback-queue";
import {
  buildActivitySessionPayload,
  parseFeedbackRequest,
} from "../ingestion/activity-session-payload";

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? "https://me.ripplup.app";
const INGEST_ENDPOINT = "/v1/activity-sessions";
const FEEDBACK_ENDPOINT = (id: string) => `${INGEST_ENDPOINT}/${id}/feedback`;
const SYNC_ALARM = "rippl-dashboard-sync";
const SYNC_INTERVAL_MINUTES = 60;

function getExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest?.().version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function getBrowserVersion(): string {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const chromeVersion = userAgent.match(/Chrome\/([\d.]+)/)?.[1];
  return chromeVersion ?? "unknown";
}

function toIngestionPayload(session: ActivitySession) {
  return buildActivitySessionPayload({
    id: session.id,
    domain: session.domain,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs: session.durationMs,
    activeMs: session.activeMs,
    metrics: session.metrics,
    extensionVersion: getExtensionVersion(),
    sourceVersion: getBrowserVersion(),
  });
}

export async function getAuthToken(): Promise<string | null> {
  const config = await db.config.get("dashboardToken");
  return (config?.value as string) ?? null;
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${DASHBOARD_URL}${INGEST_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  await db.config.put({ key: "dashboardToken", value: token });
  await db.activitySessions.where("syncStatus").equals("local").modify({ syncStatus: "pending" });
  console.log("[rippl-sync] token stored, marked local sessions as pending");
}

export async function clearAuthToken(): Promise<void> {
  await db.config.delete("dashboardToken");
  console.log("[rippl-sync] token cleared");
}

async function getPendingSessions(): Promise<ActivitySession[]> {
  return db.activitySessions.where("syncStatus").equals("pending").sortBy("createdAt");
}

async function queueFeedbackFromIngestionResponse(response: Response): Promise<void> {
  let responseBody: unknown;

  try {
    responseBody = await response.json();
  } catch {
    return;
  }

  const parsed = parseFeedbackRequest(responseBody as Parameters<typeof parseFeedbackRequest>[0]);
  if (!parsed) return;

  const backendSessionId =
    typeof responseBody === "object" && responseBody !== null
      ? (responseBody as { session_id?: unknown }).session_id
      : undefined;

  if (typeof backendSessionId !== "string" || backendSessionId.trim() === "") {
    console.warn("[rippl-sync] missing session_id in feedback response payload");
    return;
  }

  await queueFeedback({
    sessionId: backendSessionId,
    question: parsed.question,
    options: parsed.options,
  });
}

export async function syncSessions(): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;

  const pending = await getPendingSessions();
  if (pending.length === 0) return;

  console.log("[rippl-sync] syncing", pending.length, "sessions");

  for (const session of pending) {
    try {
      const res = await fetch(`${DASHBOARD_URL}${INGEST_ENDPOINT}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(toIngestionPayload(session)),
      });

      if (res.status === 401) {
        console.warn("[rippl-sync] 401 — token invalid, clearing");
        await clearAuthToken();
        await db.activitySessions.where("syncStatus").notEqual("synced").modify({ syncStatus: "local" });
        return;
      }

      if (!res.ok) {
        console.error("[rippl-sync] sync failed", res.status, session.id);
        continue;
      }

      await queueFeedbackFromIngestionResponse(res);
      await db.activitySessions.update(session.id, { syncStatus: "synced" });
      console.log("[rippl-sync] synced session", session.id);
    } catch (e) {
      console.error("[rippl-sync] network error", e);
    }
  }
}

export async function submitSessionFeedback(
  sessionId: string,
  value: string,
  type = "task_type",
): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  try {
    const res = await fetch(`${DASHBOARD_URL}${FEEDBACK_ENDPOINT(sessionId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ type, value }),
    });

    if (res.status === 401) {
      await clearAuthToken();
      return false;
    }

    if (res.status === 404) {
      return true;
    }

    return res.ok;
  } catch {
    return false;
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
