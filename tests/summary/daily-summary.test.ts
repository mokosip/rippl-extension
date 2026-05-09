import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index";
import { computeDailySummary } from "../../src/summary/daily-summary";
import type { ActivitySession } from "../../src/db/index";

// Helpers — startedAt is a UTC ms timestamp that maps to a given date
function msFor(dateStr: string, hour = 12): number {
  return Date.parse(`${dateStr}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

function makeSession(overrides: Partial<ActivitySession> & { id: string; startedAt: number }): ActivitySession {
  return {
    domain: "example.com",
    endedAt: overrides.startedAt + 60_000,
    durationMs: 60_000,
    activeMs: 50_000,
    metrics: { interaction_count: 0, copy_events: 0, paste_events: 0 },
    syncStatus: "local",
    createdAt: overrides.startedAt + 60_000,
    ...overrides,
  };
}

afterEach(async () => {
  await db.activitySessions.clear();
});

describe("computeDailySummary", () => {
  it("returns zero summary for empty day", async () => {
    const result = await computeDailySummary("2024-01-01");
    expect(result).toEqual({
      date: "2024-01-01",
      sessionCount: 0,
      totalDurationMs: 0,
      totalActiveMs: 0,
      domainsUsed: [],
    });
  });

  it("computes summary for a day with sessions", async () => {
    await db.activitySessions.bulkPut([
      makeSession({ id: "s1", startedAt: msFor("2024-01-02"), domain: "github.com", durationMs: 120_000, activeMs: 100_000 }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-02", 14), domain: "notion.so", durationMs: 60_000, activeMs: 45_000 }),
      makeSession({ id: "s3", startedAt: msFor("2024-01-02", 16), domain: "github.com", durationMs: 180_000, activeMs: 160_000 }),
    ]);

    const result = await computeDailySummary("2024-01-02");

    expect(result.date).toBe("2024-01-02");
    expect(result.sessionCount).toBe(3);
    expect(result.totalDurationMs).toBe(360_000);
    expect(result.totalActiveMs).toBe(305_000);
    expect(result.domainsUsed).toHaveLength(2);
    expect(result.domainsUsed).toContain("github.com");
    expect(result.domainsUsed).toContain("notion.so");
  });

  it("falls back to durationMs when activeMs is undefined", async () => {
    const session = makeSession({ id: "s1", startedAt: msFor("2024-01-03"), durationMs: 90_000 });
    delete (session as Partial<ActivitySession>).activeMs;
    await db.activitySessions.put(session);

    const result = await computeDailySummary("2024-01-03");

    expect(result.totalDurationMs).toBe(90_000);
    expect(result.totalActiveMs).toBe(90_000); // falls back to durationMs
  });

  it("deduplicates domains in domainsUsed", async () => {
    await db.activitySessions.bulkPut([
      makeSession({ id: "s1", startedAt: msFor("2024-01-04"), domain: "github.com" }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-04", 14), domain: "github.com" }),
      makeSession({ id: "s3", startedAt: msFor("2024-01-04", 16), domain: "notion.so" }),
    ]);

    const result = await computeDailySummary("2024-01-04");

    expect(result.domainsUsed).toHaveLength(2);
    expect(result.domainsUsed).toContain("github.com");
    expect(result.domainsUsed).toContain("notion.so");
  });

  it("does not include sessions from other dates", async () => {
    await db.activitySessions.bulkPut([
      makeSession({ id: "s1", startedAt: msFor("2024-01-06"), domain: "github.com", durationMs: 120_000 }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-07"), domain: "notion.so", durationMs: 600_000 }),
    ]);

    const result = await computeDailySummary("2024-01-06");

    expect(result.sessionCount).toBe(1);
    expect(result.domainsUsed).toEqual(["github.com"]);
    expect(result.totalDurationMs).toBe(120_000);
  });

  it("sums durationMs and activeMs correctly across multiple sessions", async () => {
    await db.activitySessions.bulkPut([
      makeSession({ id: "s1", startedAt: msFor("2024-01-08"), durationMs: 300_000, activeMs: 250_000 }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-08", 14), durationMs: 600_000, activeMs: 480_000 }),
    ]);

    const result = await computeDailySummary("2024-01-08");

    expect(result.totalDurationMs).toBe(900_000);
    expect(result.totalActiveMs).toBe(730_000);
  });
});
