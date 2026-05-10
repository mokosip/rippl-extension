import { describe, it, expect, afterEach } from "vitest";
import { db, type ActivitySession } from "../../src/db/index";
import { getActivitySessionsInRange, pruneOldSessions } from "../../src/db/queries";

function makeActivitySession(overrides: Partial<ActivitySession> & { id: string; startedAt: number }): ActivitySession {
  return {
    domain: "claude.ai",
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

describe("getActivitySessionsInRange", () => {
  it("returns sessions within the date range", async () => {
    // 2024-01-02T12:00:00Z
    const inRange = makeActivitySession({ id: "s1", startedAt: Date.parse("2024-01-02T12:00:00Z") });
    // 2024-01-04T06:00:00Z
    const inRange2 = makeActivitySession({ id: "s2", startedAt: Date.parse("2024-01-04T06:00:00Z") });
    // 2023-12-31 — before range
    const before = makeActivitySession({ id: "s3", startedAt: Date.parse("2023-12-31T12:00:00Z") });
    // 2024-01-08 — after range
    const after = makeActivitySession({ id: "s4", startedAt: Date.parse("2024-01-08T12:00:00Z") });

    await db.activitySessions.bulkPut([inRange, inRange2, before, after]);

    const result = await getActivitySessionsInRange("2024-01-01", "2024-01-07");

    expect(result.map(s => s.id).sort()).toEqual(["s1", "s2"]);
  });

  it("returns empty array when no sessions in range", async () => {
    await db.activitySessions.put(
      makeActivitySession({ id: "s1", startedAt: Date.parse("2024-01-10T12:00:00Z") })
    );

    const result = await getActivitySessionsInRange("2024-01-01", "2024-01-07");
    expect(result).toHaveLength(0);
  });

  it("includes sessions on boundary dates", async () => {
    // start of startDate (UTC midnight)
    const atStart = makeActivitySession({ id: "s-start", startedAt: Date.parse("2024-01-01T00:00:00Z") });
    // end of endDate (UTC 23:59:59.999)
    const atEnd = makeActivitySession({ id: "s-end", startedAt: Date.parse("2024-01-07T23:59:59.000Z") });

    await db.activitySessions.bulkPut([atStart, atEnd]);

    const result = await getActivitySessionsInRange("2024-01-01", "2024-01-07");
    expect(result.map(s => s.id).sort()).toEqual(["s-end", "s-start"]);
  });
});

describe("pruneOldSessions", () => {
  it("deletes activitySessions older than 90 days", async () => {
    const now = new Date("2024-04-10T00:00:00Z");
    const cutoff = new Date("2024-01-10T00:00:00Z"); // 90 days before

    // 89 days old — should survive
    const recent = makeActivitySession({ id: "s-recent", startedAt: new Date("2024-01-11T00:00:00Z").getTime() });
    // 91 days old — should be pruned
    const old = makeActivitySession({ id: "s-old", startedAt: new Date("2024-01-09T00:00:00Z").getTime() });

    await db.activitySessions.bulkPut([recent, old]);

    await pruneOldSessions(now);

    const remaining = await db.activitySessions.toArray();
    expect(remaining.map(s => s.id)).toEqual(["s-recent"]);
  });

  it("is a no-op when table is empty", async () => {
    await expect(pruneOldSessions()).resolves.toBeUndefined();
  });
});
