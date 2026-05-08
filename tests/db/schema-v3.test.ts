import { describe, it, expect } from "vitest";
import Dexie from "dexie";
import { createRipplDb, type Session } from "../../src/db/index";

describe("db v3 migration", () => {
  it("purges legacy sessions, creates v3 tables, and keeps legacy sessions API", async () => {
    const name = `rippl-migrate-${Date.now()}`;

    const legacy = new Dexie(name);
    legacy.version(2).stores({
      sessions: "id, domain, date, logged, badgeExpiry, syncStatus",
      config: "key",
      customDomains: "hostname",
    });

    await legacy.open();
    await legacy.table("sessions").add({
      id: "legacy-1",
      domain: "claude.ai",
      date: "2024-01-01",
      logged: true,
      badgeExpiry: null,
      syncStatus: "local",
    });
    await legacy.close();

    const db = createRipplDb(name);
    await db.open();

    expect(await db.sessions.count()).toBe(0);
    expect(await db.activitySessions.count()).toBe(0);
    expect(await db.feedbackQueue.count()).toBe(0);

    const transitionalSession: Session = {
      id: "new-1",
      domain: "chatgpt.com",
      startedAt: 100,
      endedAt: 200,
      activeSeconds: 100,
      date: "2024-01-02",
      activityType: null,
      estimatedWithoutMinutes: null,
      timeSavedMinutes: null,
      logged: false,
      badgeExpiry: null,
      syncStatus: "pending",
    };
    await db.sessions.put(transitionalSession);
    expect(await db.sessions.count()).toBe(1);

    await db.close();
    await Dexie.delete(name);
  });
});
