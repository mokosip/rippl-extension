import { db, type Session, type Config, type CustomDomain } from "../db/index";

export async function isTrackingPaused(): Promise<boolean> {
  const entry = await db.config.get("trackingPaused");
  if (!entry) return false;
  return entry.value === true;
}

export async function setTrackingPaused(paused: boolean): Promise<void> {
  await db.config.put({ key: "trackingPaused", value: paused });
}

export async function deleteAllData(): Promise<void> {
  await db.sessions.clear();
  await db.config.clear();
  await db.customDomains.clear();
}

export async function exportAllData(): Promise<{
  sessions: Session[];
  config: Config[];
  customDomains: CustomDomain[];
}> {
  const [sessions, config, customDomains] = await Promise.all([
    db.sessions.toArray(),
    db.config.toArray(),
    db.customDomains.toArray(),
  ]);
  return { sessions, config, customDomains };
}
