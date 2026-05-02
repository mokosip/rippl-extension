import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index";
import type { Session, CustomDomain } from "../../src/db/index";
import {
  isTrackingPaused,
  setTrackingPaused,
  deleteAllData,
  exportAllData,
} from "../../src/privacy/privacy-controls";

function makeSession(id: string): Session {
  return {
    id,
    domain: "example.com",
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_060_000,
    activeSeconds: 60,
    date: "2024-01-01",
    activityType: null,
    estimatedWithoutMinutes: null,
    timeSavedMinutes: null,
    logged: false,
    badgeExpiry: null,
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
  await db.sessions.clear();
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
  it("clears all DB tables (sessions, config, customDomains)", async () => {
    await db.sessions.bulkPut([makeSession("s1"), makeSession("s2")]);
    await db.config.put({ key: "trackingPaused", value: true });
    await db.customDomains.put(makeCustomDomain("my-tool.com"));

    await deleteAllData();

    expect(await db.sessions.count()).toBe(0);
    expect(await db.config.count()).toBe(0);
    expect(await db.customDomains.count()).toBe(0);
  });

  it("is a no-op when tables are already empty", async () => {
    await expect(deleteAllData()).resolves.toBeUndefined();
  });
});

describe("exportAllData", () => {
  it("returns all data from all tables", async () => {
    const sessions = [makeSession("s1"), makeSession("s2")];
    const configEntry = { key: "trackingPaused", value: true };
    const domain = makeCustomDomain("my-tool.com");

    await db.sessions.bulkPut(sessions);
    await db.config.put(configEntry);
    await db.customDomains.put(domain);

    const result = await exportAllData();

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions).toEqual(expect.arrayContaining(sessions));
    expect(result.config).toHaveLength(1);
    expect(result.config[0]).toEqual(configEntry);
    expect(result.customDomains).toHaveLength(1);
    expect(result.customDomains[0]).toEqual(domain);
  });

  it("returns empty arrays when tables are empty", async () => {
    const result = await exportAllData();
    expect(result.sessions).toEqual([]);
    expect(result.config).toEqual([]);
    expect(result.customDomains).toEqual([]);
  });
});
