import {
  db,
  type ActivitySession,
  type FeedbackQueueItem,
  type Config,
  type CustomDomain,
} from "../db/index";

export async function isTrackingPaused(): Promise<boolean> {
  const entry = await db.config.get("trackingPaused");
  if (!entry) return false;
  return entry.value === true;
}

export async function setTrackingPaused(paused: boolean): Promise<void> {
  await db.config.put({ key: "trackingPaused", value: paused });
}

export async function deleteAllData(): Promise<void> {
  await db.activitySessions.clear();
  await db.feedbackQueue.clear();
  await db.config.clear();
  await db.customDomains.clear();
}

export async function exportAllData(): Promise<{
  activitySessions: ActivitySession[];
  feedbackQueue: FeedbackQueueItem[];
  config: Config[];
  customDomains: CustomDomain[];
}> {
  const [activitySessions, feedbackQueue, config, customDomains] = await Promise.all([
    db.activitySessions.toArray(),
    db.feedbackQueue.toArray(),
    db.config.toArray(),
    db.customDomains.toArray(),
  ]);
  return { activitySessions, feedbackQueue, config, customDomains };
}
