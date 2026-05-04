import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index";
import { logSession, skipSession } from "../../src/db/queries";
import type { Session } from "../../src/db/index";

const makeSession = (overrides: Partial<Session> & { id: string }): Session => ({
  domain: "claude.ai",
  date: "2024-01-01",
  startedAt: 1000,
  endedAt: 2000,
  activeSeconds: 600,
  activityType: null,
  estimatedWithoutMinutes: null,
  timeSavedMinutes: null,
  logged: false,
  badgeExpiry: null,
  syncStatus: "local",
  ...overrides,
});

afterEach(async () => {
  await db.sessions.clear();
});

describe("logSession", () => {
  it("stores activityType as string array", async () => {
    await db.sessions.put(makeSession({ id: "s1" }));
    await logSession("s1", ["Code"], 15);

    const session = await db.sessions.get("s1");
    expect(session!.activityType).toEqual(["Code"]);
    expect(session!.logged).toBe(true);
  });

  it("stores multiple activity types", async () => {
    await db.sessions.put(makeSession({ id: "s2" }));
    await logSession("s2", ["Code", "Research"], 30);

    const session = await db.sessions.get("s2");
    expect(session!.activityType).toEqual(["Code", "Research"]);
  });

  it("computes timeSavedMinutes correctly", async () => {
    await db.sessions.put(makeSession({ id: "s3", activeSeconds: 300 }));
    await logSession("s3", ["Writing"], 15);

    const session = await db.sessions.get("s3");
    expect(session!.estimatedWithoutMinutes).toBe(15);
    expect(session!.timeSavedMinutes).toBe(10);
  });

  it("clamps timeSavedMinutes to zero when estimate is less than actual", async () => {
    await db.sessions.put(makeSession({ id: "s4", activeSeconds: 600 }));
    await logSession("s4", ["Code"], 5);

    const session = await db.sessions.get("s4");
    expect(session!.timeSavedMinutes).toBe(0);
  });

  it("does nothing for non-existent session", async () => {
    await logSession("nonexistent", ["Code"], 10);
    const count = await db.sessions.count();
    expect(count).toBe(0);
  });
});

describe("skipSession", () => {
  it("marks session as logged without setting activityType", async () => {
    await db.sessions.put(makeSession({ id: "s5" }));
    await skipSession("s5");

    const session = await db.sessions.get("s5");
    expect(session!.logged).toBe(true);
    expect(session!.activityType).toBeNull();
  });
});
