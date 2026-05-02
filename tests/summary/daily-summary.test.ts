import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index";
import { computeDailySummary } from "../../src/summary/daily-summary";
import type { Session } from "../../src/db/index";

const baseSession = (overrides: Partial<Session> & { id: string; date: string }): Session => ({
  domain: "example.com",
  startedAt: 1000,
  endedAt: 2000,
  activeSeconds: 600,
  activityType: null,
  estimatedWithoutMinutes: null,
  timeSavedMinutes: null,
  logged: false,
  badgeExpiry: null,
  ...overrides,
});

afterEach(async () => {
  await db.sessions.clear();
});

describe("computeDailySummary", () => {
  it("returns zero summary for empty day", async () => {
    const result = await computeDailySummary("2024-01-01");
    expect(result).toEqual({
      date: "2024-01-01",
      sessionCount: 0,
      totalActiveMinutes: 0,
      timeSavedMinutes: 0,
      loggedCount: 0,
      domainsUsed: [],
    });
  });

  it("computes summary for a day with sessions", async () => {
    await db.sessions.bulkPut([
      baseSession({ id: "s1", date: "2024-01-02", domain: "github.com", activeSeconds: 120, logged: true, timeSavedMinutes: 10 }),
      baseSession({ id: "s2", date: "2024-01-02", domain: "notion.so", activeSeconds: 60, logged: true, timeSavedMinutes: 5 }),
      baseSession({ id: "s3", date: "2024-01-02", domain: "slack.com", activeSeconds: 180, logged: false, timeSavedMinutes: null }),
    ]);

    const result = await computeDailySummary("2024-01-02");

    expect(result.date).toBe("2024-01-02");
    expect(result.sessionCount).toBe(3);
    // (120 + 60 + 180) = 360 seconds = 6 minutes
    expect(result.totalActiveMinutes).toBe(6);
    // logged sessions with non-null timeSavedMinutes: s1 (10) + s2 (5) = 15
    expect(result.timeSavedMinutes).toBe(15);
    // sessions where logged=true: s1, s2
    expect(result.loggedCount).toBe(2);
    expect(result.domainsUsed).toHaveLength(3);
    expect(result.domainsUsed).toContain("github.com");
    expect(result.domainsUsed).toContain("notion.so");
    expect(result.domainsUsed).toContain("slack.com");
  });

  it("only counts timeSavedMinutes from sessions that are logged AND have non-null timeSavedMinutes", async () => {
    await db.sessions.bulkPut([
      // logged=true, timeSavedMinutes=20 → counts
      baseSession({ id: "s1", date: "2024-01-03", logged: true, timeSavedMinutes: 20 }),
      // logged=true, timeSavedMinutes=null → skipped (skip session, no estimate entered)
      baseSession({ id: "s2", date: "2024-01-03", logged: true, timeSavedMinutes: null }),
      // logged=false, timeSavedMinutes=30 → skipped
      baseSession({ id: "s3", date: "2024-01-03", logged: false, timeSavedMinutes: 30 }),
    ]);

    const result = await computeDailySummary("2024-01-03");

    expect(result.timeSavedMinutes).toBe(20);
  });

  it("deduplicates domains in domainsUsed", async () => {
    await db.sessions.bulkPut([
      baseSession({ id: "s1", date: "2024-01-04", domain: "github.com" }),
      baseSession({ id: "s2", date: "2024-01-04", domain: "github.com" }),
      baseSession({ id: "s3", date: "2024-01-04", domain: "notion.so" }),
    ]);

    const result = await computeDailySummary("2024-01-04");

    expect(result.domainsUsed).toHaveLength(2);
    expect(result.domainsUsed).toContain("github.com");
    expect(result.domainsUsed).toContain("notion.so");
  });

  it("shows the correct logged ratio: loggedCount out of sessionCount", async () => {
    await db.sessions.bulkPut([
      baseSession({ id: "s1", date: "2024-01-05", logged: true }),
      baseSession({ id: "s2", date: "2024-01-05", logged: true }),
      baseSession({ id: "s3", date: "2024-01-05", logged: false }),
      baseSession({ id: "s4", date: "2024-01-05", logged: false }),
      baseSession({ id: "s5", date: "2024-01-05", logged: false }),
    ]);

    const result = await computeDailySummary("2024-01-05");

    expect(result.sessionCount).toBe(5);
    expect(result.loggedCount).toBe(2);
  });

  it("does not include sessions from other dates", async () => {
    await db.sessions.bulkPut([
      baseSession({ id: "s1", date: "2024-01-06", domain: "github.com", activeSeconds: 120 }),
      baseSession({ id: "s2", date: "2024-01-07", domain: "notion.so", activeSeconds: 600 }),
    ]);

    const result = await computeDailySummary("2024-01-06");

    expect(result.sessionCount).toBe(1);
    expect(result.domainsUsed).toEqual(["github.com"]);
  });

  it("rounds totalActiveMinutes correctly", async () => {
    await db.sessions.bulkPut([
      // 90 seconds = 1.5 minutes → rounds to 2
      baseSession({ id: "s1", date: "2024-01-08", activeSeconds: 90 }),
    ]);

    const result = await computeDailySummary("2024-01-08");

    expect(result.totalActiveMinutes).toBe(2);
  });
});
