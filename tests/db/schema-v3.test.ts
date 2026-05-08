import { describe, it, expect } from "vitest";
import Dexie from "dexie";
import { createRipplDb } from "../../src/db/index";

describe("db v3 migration", () => {
  it("purges legacy sessions and initializes new tables", async () => {
    const name = `rippl-migrate-${Date.now()}`;

    const legacy = new Dexie(name);
    legacy.version(2).stores({
      sessions: "id, domain, date, logged, badgeExpiry, syncStatus",
      config: "key",
      customDomains: "hostname",
    });
    await legacy.open();
    await legacy.table("sessions").add({ id: "legacy-1", domain: "claude.ai", logged: true });
    await legacy.close();

    const db = createRipplDb(name);
    await db.open();

    expect(await db.activitySessions.count()).toBe(0);
    expect(await db.feedbackQueue.count()).toBe(0);

    await db.close();
    await Dexie.delete(name);
  });
});
