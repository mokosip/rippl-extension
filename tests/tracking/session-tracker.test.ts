import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../../src/db/index";
import { SessionTracker } from "../../src/tracking/session-tracker";

beforeEach(async () => {
  await db.sessions.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionTracker", () => {
  it("starts a session for an AI domain and stores it in Dexie after ending", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(startTime);

    await tracker.onTabFocused("claude.ai");
    expect(tracker.getActiveSession()).not.toBeNull();
    expect(tracker.getActiveSession()?.domain).toBe("claude.ai");

    // Advance time so session exceeds minimum
    vi.spyOn(Date, "now").mockReturnValue(startTime + 15_000);
    await tracker.onTabFocused(null);

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].domain).toBe("claude.ai");
  });

  it("does not start a session for null domain", async () => {
    const tracker = new SessionTracker();
    await tracker.onTabFocused(null);
    expect(tracker.getActiveSession()).toBeNull();
  });

  it("ends session when switching to non-AI tab (domain=null)", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(startTime);

    await tracker.onTabFocused("claude.ai");
    expect(tracker.getActiveSession()).not.toBeNull();

    vi.spyOn(Date, "now").mockReturnValue(startTime + 20_000);
    await tracker.onTabFocused(null);

    expect(tracker.getActiveSession()).toBeNull();
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
  });

  it("saved session has correct fields", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;
    const endTime = startTime + 30_000;
    const BADGE_EXPIRY_MS = 24 * 60 * 60 * 1000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(endTime);
    await tracker.onTabFocused(null);

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    const session = sessions[0];

    expect(session.id).toMatch(/^sess-/);
    expect(session.domain).toBe("claude.ai");
    expect(session.startedAt).toBe(startTime);
    expect(session.endedAt).toBe(endTime);
    expect(session.activeSeconds).toBe(30);
    expect(session.date).toBe(new Date(startTime).toISOString().slice(0, 10));
    expect(session.activityType).toBeNull();
    expect(session.estimatedWithoutMinutes).toBeNull();
    expect(session.timeSavedMinutes).toBeNull();
    expect(session.logged).toBe(false);
    expect(session.badgeExpiry).toBe(endTime + BADGE_EXPIRY_MS);
  });

  it("switches domain — ends old session, starts new one", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(startTime + 15_000);
    await tracker.onTabFocused("chatgpt.com");

    expect(tracker.getActiveSession()?.domain).toBe("chatgpt.com");

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].domain).toBe("claude.ai");
  });

  it("onIdle ends current session", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(startTime + 20_000);
    await tracker.onIdle();

    expect(tracker.getActiveSession()).toBeNull();
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
  });

  it("discards micro-sessions under 10 seconds (session not saved to DB)", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    // Only 9 seconds — below minimum
    vi.spyOn(Date, "now").mockReturnValue(startTime + 9_000);
    await tracker.onTabFocused(null);

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(0);
  });

  it("saves session with exactly 10 seconds (boundary)", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(startTime + 10_000);
    await tracker.onTabFocused(null);

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].activeSeconds).toBe(10);
  });

  it("onHeartbeat updates lastSeenAt on active session", () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    // onTabFocused is async, but we can test sync heartbeat behavior by working with internal state
    tracker.getActiveSession(); // ensure null initially

    // Manually simulate an active session by calling onTabFocused first
    // We'll use a resolved promise pattern
    const heartbeatTime = startTime + 5_000;

    // We need to set up the active session first
    vi.spyOn(Date, "now").mockReturnValue(startTime);
    const focusPromise = tracker.onTabFocused("claude.ai").then(() => {
      const sessionAfterFocus = tracker.getActiveSession();
      expect(sessionAfterFocus?.lastSeenAt).toBe(startTime);

      vi.spyOn(Date, "now").mockReturnValue(heartbeatTime);
      tracker.onHeartbeat();

      const sessionAfterHeartbeat = tracker.getActiveSession();
      expect(sessionAfterHeartbeat?.lastSeenAt).toBe(heartbeatTime);
    });

    return focusPromise;
  });

  it("onHeartbeat is a no-op when no active session", () => {
    const tracker = new SessionTracker();
    // Should not throw
    expect(() => tracker.onHeartbeat()).not.toThrow();
    expect(tracker.getActiveSession()).toBeNull();
  });

  it("does not end session when focusing the same domain again", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");
    const session1 = tracker.getActiveSession();

    vi.spyOn(Date, "now").mockReturnValue(startTime + 5_000);
    await tracker.onTabFocused("claude.ai");
    const session2 = tracker.getActiveSession();

    // Same session should still be active
    expect(session1?.id).toBe(session2?.id);
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(0);
  });
});
