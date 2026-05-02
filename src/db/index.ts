import Dexie, { type EntityTable } from "dexie";

export interface Session {
  id: string;
  domain: string;
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  date: string; // "YYYY-MM-DD"
  activityType: string | null;
  estimatedWithoutMinutes: number | null;
  timeSavedMinutes: number | null;
  logged: boolean;
  badgeExpiry: number | null; // timestamp — 24h after session end
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

const db = new Dexie("rippl") as Dexie & {
  sessions: EntityTable<Session, "id">;
  config: EntityTable<Config, "key">;
  customDomains: EntityTable<CustomDomain, "hostname">;
};

db.version(1).stores({
  sessions: "id, domain, date, logged, badgeExpiry",
  config: "key",
  customDomains: "hostname",
});

export { db };
