import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index";
import type { ActivitySession, FeedbackQueueItem, CustomDomain } from "../../src/db/index";
import {
  isTrackingPaused,
  setTrackingPaused,
  deleteAllData,
  exportAllData,
} from "../../src/privacy/privacy-controls";

function makeActivitySession(id: string): ActivitySession {
  return {
    id,
    domain: "example.com",
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_060_000,
    durationMs: 60_000,
    activeMs: 50_000,
    metrics: { interaction_count: 0, copy_events: 0, paste_events: 0 },
    syncStatus: "local",
    createdAt: 1_700_000_060_000,
  };
}

function makeFeedbackItem(id: string): FeedbackQueueItem {
  return {
    id,
    sessionId: "sess-1",
    question: "What were you working on?",
    options: [{ label: "Coding", value: "coding" }],
    expiresAt: 1_700_000_060_000 + 86_400_000,
    status: "pending",
    createdAt: 1_700_000_060_000,
  };
}

function makeCustomDomain(hostname: string): CustomDomain {
  return {
    hostname,
    label: "My Tool",
    addedAt: 1_700_000_000_000,
  };
}

afterEach(async () => {
  await db.activitySessions.clear();
  await db.feedbackQueue.clear();
  await db.config.clear();
  await db.customDomains.clear();
});

describe("isTrackingPaused", () => {
  it("returns false when no config entry exists", async () => {
    const result = await isTrackingPaused();
    expect(result).toBe(false);
  });

  it("returns false when trackingPaused is explicitly set to false", async () => {
    await db.config.put({ key: "trackingPaused", value: false });
    const result = await isTrackingPaused();
    expect(result).toBe(false);
  });

  it("returns true when trackingPaused is set to true", async () => {
    await db.config.put({ key: "trackingPaused", value: true });
    const result = await isTrackingPaused();
    expect(result).toBe(true);
  });
});

describe("setTrackingPaused", () => {
  it("can pause tracking (isTrackingPaused returns true after setTrackingPaused(true))", async () => {
    await setTrackingPaused(true);
    const result = await isTrackingPaused();
    expect(result).toBe(true);
  });

  it("can unpause tracking (isTrackingPaused returns false after setTrackingPaused(false))", async () => {
    await setTrackingPaused(true);
    await setTrackingPaused(false);
    const result = await isTrackingPaused();
    expect(result).toBe(false);
  });

  it("persists the value in the config table under key trackingPaused", async () => {
    await setTrackingPaused(true);
    const entry = await db.config.get("trackingPaused");
    expect(entry).toBeDefined();
    expect(entry?.value).toBe(true);
  });
});

describe("deleteAllData", () => {
  it("clears activitySessions, feedbackQueue, config, and customDomains", async () => {
    await db.activitySessions.bulkPut([makeActivitySession("s1"), makeActivitySession("s2")]);
    await db.feedbackQueue.bulkPut([makeFeedbackItem("f1")]);
    await db.config.put({ key: "trackingPaused", value: true });
    await db.customDomains.put(makeCustomDomain("my-tool.com"));

    await deleteAllData();

    expect(await db.activitySessions.count()).toBe(0);
    expect(await db.feedbackQueue.count()).toBe(0);
    expect(await db.config.count()).toBe(0);
    expect(await db.customDomains.count()).toBe(0);
  });

  it("is a no-op when tables are already empty", async () => {
    await expect(deleteAllData()).resolves.toBeUndefined();
  });
});

describe("exportAllData", () => {
  it("returns activitySessions, feedbackQueue, config, and customDomains", async () => {
    const sessions = [makeActivitySession("s1"), makeActivitySession("s2")];
    const feedback = [makeFeedbackItem("f1")];
    const configEntry = { key: "trackingPaused", value: true };
    const domain = makeCustomDomain("my-tool.com");

    await db.activitySessions.bulkPut(sessions);
    await db.feedbackQueue.bulkPut(feedback);
    await db.config.put(configEntry);
    await db.customDomains.put(domain);

    const result = await exportAllData();

    expect(result.activitySessions).toHaveLength(2);
    expect(result.activitySessions).toEqual(expect.arrayContaining(sessions));
    expect(result.feedbackQueue).toHaveLength(1);
    expect(result.feedbackQueue[0].id).toBe("f1");
    expect(result.config).toHaveLength(1);
    expect(result.config[0]).toEqual(configEntry);
    expect(result.customDomains).toHaveLength(1);
    expect(result.customDomains[0]).toEqual(domain);
  });

  it("returns empty arrays when tables are empty", async () => {
    const result = await exportAllData();
    expect(result.activitySessions).toEqual([]);
    expect(result.feedbackQueue).toEqual([]);
    expect(result.config).toEqual([]);
    expect(result.customDomains).toEqual([]);
  });
});
