import Dexie, { type EntityTable } from "dexie";

export interface Session {
  id: string;
  domain: string;
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  date: string;
  activityType: string[] | null;
  estimatedWithoutMinutes: number | null;
  timeSavedMinutes: number | null;
  logged: boolean;
  badgeExpiry: number | null;
  syncStatus?: "pending" | "synced" | "local";
}

export interface ActivitySession {
  id: string;
  domain: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  activeMs?: number;
  metrics: {
    interaction_count: number;
    copy_events: number;
    paste_events: number;
  };
  syncStatus: "pending" | "synced" | "local";
  createdAt: number;
}

export interface FeedbackQueueItem {
  id: string;
  sessionId: string;
  question: string;
  options: Array<{ label: string; value: string }>;
  expiresAt: number;
  status: "pending" | "answered" | "expired";
  createdAt: number;
}

export interface Config {
  key: string;
  value: unknown;
}

export interface CustomDomain {
  hostname: string;
  label: string;
  addedAt: number;
}

export function createRipplDb(name = "rippl") {
  const database = new Dexie(name) as Dexie & {
    sessions: EntityTable<Session, "id">;
    activitySessions: EntityTable<ActivitySession, "id">;
    feedbackQueue: EntityTable<FeedbackQueueItem, "id">;
    config: EntityTable<Config, "key">;
    customDomains: EntityTable<CustomDomain, "hostname">;
  };

  database
    .version(3)
    .stores({
      sessions: "id, domain, date, logged, badgeExpiry, syncStatus",
      activitySessions: "id, domain, startedAt, endedAt, syncStatus, createdAt",
      feedbackQueue: "id, sessionId, status, expiresAt, createdAt",
      config: "key",
      customDomains: "hostname",
    })
    .upgrade(async tx => {
      await tx.table("sessions").clear();
    });

  return database;
}

export const db = createRipplDb();
