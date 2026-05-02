import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "../../src/db/index";
import { updateBadge } from "../../src/badge/badge-manager";

// Use absolute timestamps that are always past/future relative to real Date.now():
// FUTURE_EXPIRY: year 3000 — always in the future
// PAST_EXPIRY:   year 2000 — always in the past
const FUTURE_EXPIRY = 32_503_680_000_000;
const PAST_EXPIRY = 946_684_800_000;

function makeSession(id: string, logged: boolean, badgeExpiry: number | null) {
  return {
    id,
    domain: "example.com",
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_060_000,
    activeSeconds: 60,
    date: "2023-11-14",
    activityType: null,
    estimatedWithoutMinutes: null,
    timeSavedMinutes: null,
    logged,
    badgeExpiry,
  };
}

describe("updateBadge", () => {
  afterEach(async () => {
    await db.sessions.clear();
    vi.clearAllMocks();
  });

  it("shows count and terra color when unlogged non-expired sessions exist", async () => {
    await db.sessions.bulkAdd([
      makeSession("s1", false, FUTURE_EXPIRY),
      makeSession("s2", false, FUTURE_EXPIRY),
    ]);

    await updateBadge(false);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "2" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#B05F3F" });
  });

  it("shows empty badge text when all sessions are logged", async () => {
    await db.sessions.bulkAdd([
      makeSession("s1", true, FUTURE_EXPIRY),
      makeSession("s2", true, FUTURE_EXPIRY),
    ]);

    await updateBadge(false);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it("shows empty badge text when paused=true, regardless of unlogged sessions", async () => {
    await db.sessions.bulkAdd([
      makeSession("s1", false, FUTURE_EXPIRY),
    ]);

    await updateBadge(true);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it("ignores sessions whose badgeExpiry is in the past", async () => {
    await db.sessions.bulkAdd([
      makeSession("s1", false, PAST_EXPIRY),
      makeSession("s2", false, PAST_EXPIRY),
    ]);

    await updateBadge(false);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it("ignores sessions with null badgeExpiry", async () => {
    await db.sessions.bulkAdd([
      makeSession("s1", false, null),
    ]);

    await updateBadge(false);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it("only counts non-expired unlogged sessions (mix of logged/unlogged/expired)", async () => {
    await db.sessions.bulkAdd([
      makeSession("s1", false, FUTURE_EXPIRY),  // counts
      makeSession("s2", true, FUTURE_EXPIRY),   // logged — skip
      makeSession("s3", false, PAST_EXPIRY),    // expired — skip
      makeSession("s4", false, null),           // null expiry — skip
    ]);

    await updateBadge(false);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "1" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#B05F3F" });
  });

  it("shows empty badge when no sessions exist at all", async () => {
    await updateBadge(false);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });
});
